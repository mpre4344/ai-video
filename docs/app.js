const LS_KEY='ai_video_studio_cfg_v1';

function loadCfg(){
  const raw=localStorage.getItem(LS_KEY);
  const cfg=raw?JSON.parse(raw):{};
  ['baseUrl','apiKey','chatModel','videoModel','imageModel'].forEach(k=>{
    const el=document.getElementById(k); if(el) el.value=cfg[k]||'';
  });
  const providerEl=document.getElementById('imageProvider');
  if(providerEl) providerEl.value=cfg.imageProvider||'openai';
  return cfg;
}

function getCfg(){
  return {
    baseUrl:document.getElementById('baseUrl').value.trim().replace(/\/$/,''),
    apiKey:document.getElementById('apiKey').value.trim(),
    chatModel:document.getElementById('chatModel').value.trim(),
    videoModel:document.getElementById('videoModel').value.trim(),
    imageProvider:document.getElementById('imageProvider').value,
    imageModel:document.getElementById('imageModel').value.trim(),
  };
}

window.saveCfg=()=>{
  const cfg=getCfg();
  localStorage.setItem(LS_KEY,JSON.stringify(cfg));
  alert('配置已保存到浏览器本地');
};

function parseShots(text){
  return text.split('\n').map(s=>s.trim()).filter(Boolean).map(l=>{
    const m=l.match(/^镜头\d{2}[:：]\s*(.*)$/); return m?m[1]:null;
  }).filter(Boolean);
}

async function chatCompletion({baseUrl,apiKey,model,messages,temperature=0.7}){
  const r=await fetch(`${baseUrl}/chat/completions`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
    body:JSON.stringify({model,messages,temperature})
  });
  if(!r.ok) throw new Error(`chat ${r.status}: ${await r.text()}`);
  const data=await r.json();
  return data?.choices?.[0]?.message?.content||'';
}

window.generateStoryboard=async()=>{
  try{
    const {baseUrl,apiKey,chatModel}=getCfg();
    const script=document.getElementById('script').value.trim();
    const styleHint=document.getElementById('styleHint').value.trim();
    if(!baseUrl||!apiKey||!chatModel) throw new Error('请先配置 BaseURL/APIKey/ChatModel');
    const prompt=`你是电影分镜导演。根据以下剧情生成连续9镜头，格式严格为：\n镜头01：...\n...\n镜头09：...\n要求：同一场景同一时间轴，动作与情绪连续推进，人物外观服装一致。\n剧情：${script}\n风格参考：${styleHint}`;
    const content=await chatCompletion({baseUrl,apiKey,model:chatModel,messages:[{role:'user',content:prompt}]});
    document.getElementById('storyboard').value=content;
    switchStep(2);
  }catch(e){alert(e.message||String(e));}
};

window.buildGridPrompt=()=>{
  const summary=document.getElementById('summary').value.trim();
  const shots=parseShots(document.getElementById('storyboard').value);
  if(shots.length!==9) return alert('请先准备9条镜头');
  const txt=`根据${summary}，生成一张具有凝聚力的3×3网格图像，包含同一环境中的9个不同摄像机镜头，严格保持人物/物体、服装和光线一致性，8K分辨率，16:9画幅。\n${shots.map((s,i)=>`镜头${String(i+1).padStart(2,'0')}：${s}`).join('\n')}\n最终必须是九宫格，每个格子比例为16:9。`;
  document.getElementById('gridPrompt').value=txt;
  switchStep(3);
};

function smooth1d(arr, radius=4){
  const out=new Array(arr.length).fill(0);
  for(let i=0;i<arr.length;i++){
    let s=0,c=0;
    for(let k=i-radius;k<=i+radius;k++){
      if(k>=0&&k<arr.length){ s+=arr[k]; c++; }
    }
    out[i]=c? s/c : arr[i];
  }
  return out;
}

function pickLinePeaks(profile, len){
  // 在 1/3 与 2/3 附近各找一个最强边界，适配非等分九宫格
  const expected=[len/3, len*2/3];
  const win=Math.max(12, Math.floor(len*0.18));
  const peaks=[];
  for(const e of expected){
    const from=Math.max(2, Math.floor(e-win));
    const to=Math.min(len-3, Math.floor(e+win));
    let best=from, bestVal=-1;
    for(let i=from;i<=to;i++){
      if(profile[i]>bestVal){ bestVal=profile[i]; best=i; }
    }
    peaks.push(best);
  }
  peaks.sort((a,b)=>a-b);
  if(peaks[1]-peaks[0] < len*0.12){
    // 若两条线太近，说明检测不稳定，回退到理想分割
    return [Math.floor(len/3), Math.floor(len*2/3)];
  }
  return peaks;
}

function detectGridCuts(img){
  // 1) 为了性能先缩放检测，再映射回原图
  const maxSide=1600;
  const scale=Math.min(1, maxSide/Math.max(img.width,img.height));
  const sw=Math.max(32, Math.round(img.width*scale));
  const sh=Math.max(32, Math.round(img.height*scale));

  const cv=document.createElement('canvas');
  cv.width=sw; cv.height=sh;
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,sw,sh);
  const data=ctx.getImageData(0,0,sw,sh).data;

  // 2) 构建亮度图（Y）
  const Y=new Float32Array(sw*sh);
  for(let i=0,p=0;i<Y.length;i++,p+=4){
    const r=data[p], g=data[p+1], b=data[p+2];
    Y[i]=0.299*r+0.587*g+0.114*b;
  }

  // 3) 计算纵/横向边缘能量投影
  const vProf=new Array(sw).fill(0);
  const hProf=new Array(sh).fill(0);

  for(let y=1;y<sh-1;y++){
    for(let x=1;x<sw-1;x++){
      const idx=y*sw+x;
      const gx=Math.abs(Y[idx]-Y[idx-1]);
      const gy=Math.abs(Y[idx]-Y[idx-sw]);
      vProf[x]+=gx;
      hProf[y]+=gy;
    }
  }

  const vSmooth=smooth1d(vProf,6);
  const hSmooth=smooth1d(hProf,6);
  const [vx1,vx2]=pickLinePeaks(vSmooth,sw);
  const [hy1,hy2]=pickLinePeaks(hSmooth,sh);

  // 4) 映射回原始坐标
  const toX=v=>Math.max(1, Math.min(img.width-1, Math.round(v/scale)));
  const toY=v=>Math.max(1, Math.min(img.height-1, Math.round(v/scale)));

  const xCuts=[0,toX(vx1),toX(vx2),img.width];
  const yCuts=[0,toY(hy1),toY(hy2),img.height];

  // 防御性：若检测异常（非递增），回退到均分
  const valid=(arr)=>arr[0]<arr[1]&&arr[1]<arr[2]&&arr[2]<arr[3];
  if(!valid(xCuts) || !valid(yCuts)){
    return {
      xCuts:[0,Math.floor(img.width/3),Math.floor(img.width*2/3),img.width],
      yCuts:[0,Math.floor(img.height/3),Math.floor(img.height*2/3),img.height],
      detected:false
    };
  }

  return {xCuts,yCuts,detected:true};
}

async function loadGridImage(){
  const f=document.getElementById('gridImage').files?.[0];
  if(!f) throw new Error('先上传九宫格图片');
  const img=new Image();
  img.src=URL.createObjectURL(f);
  await img.decode();
  return img;
}

window.previewGridBounds=async()=>{
  try{
    const img=await loadGridImage();
    const {xCuts,yCuts,detected}=detectGridCuts(img);

    const maxW=900;
    const scale=Math.min(1,maxW/img.width);
    const vw=Math.round(img.width*scale);
    const vh=Math.round(img.height*scale);

    const cv=document.createElement('canvas');
    cv.width=vw; cv.height=vh;
    const ctx=cv.getContext('2d');
    ctx.drawImage(img,0,0,vw,vh);

    // 边界线
    ctx.lineWidth=2;
    ctx.strokeStyle=detected?'#00e676':'#ff9800';
    for(let i=1;i<=2;i++){
      const x=Math.round(xCuts[i]*scale)+0.5;
      const y=Math.round(yCuts[i]*scale)+0.5;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,vh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(vw,y); ctx.stroke();
    }

    // 标签
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.fillRect(8,8,220,28);
    ctx.fillStyle='#fff';
    ctx.font='14px Arial';
    ctx.fillText(detected?'智能边界识别':'均分回退（识别不稳定）',14,27);

    const box=document.getElementById('gridPreview');
    box.innerHTML='';
    box.appendChild(cv);
  }catch(e){ alert(e.message||String(e)); }
};

window.splitGrid=async()=>{
  try{
    const img=await loadGridImage();
    const {xCuts,yCuts,detected}=detectGridCuts(img);
    const wrap=document.getElementById('pieces');
    wrap.innerHTML='';

    for(let r=0;r<3;r++) for(let c=0;c<3;c++){
      const sx=xCuts[c], sy=yCuts[r];
      const sw=xCuts[c+1]-xCuts[c], sh=yCuts[r+1]-yCuts[r];

      const cv=document.createElement('canvas');
      cv.width=sw; cv.height=sh;
      cv.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh);

      const url=cv.toDataURL('image/png');
      const a=document.createElement('a');
      a.href=url;
      a.download=`panel_${r*3+c+1}.png`;
      const im=document.createElement('img');
      im.src=url;
      im.title=`${detected?'智能边界':'均分回退'}: x=${sx}-${sx+sw}, y=${sy}-${sy+sh}`;
      a.appendChild(im);
      wrap.appendChild(a);
    }
    switchStep(5);
  }catch(e){ alert(e.message||String(e)); }
};

window.generateImage=async()=>{
  try{
    const {baseUrl,apiKey,imageProvider,imageModel}=getCfg();
    const prompt=document.getElementById('imagePrompt').value.trim() || document.getElementById('gridPrompt').value.trim();
    if(!baseUrl||!apiKey||!imageModel) throw new Error('请先配置 BaseURL/APIKey/ImageModel');
    if(!prompt) throw new Error('请先填写图片提示词');

    let imageUrl='';
    if(imageProvider==='openai'){
      const r=await fetch(`${baseUrl}/images/generations`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body:JSON.stringify({model:imageModel,prompt,size:'1792x1024'})
      });
      if(!r.ok) throw new Error(`openai image ${r.status}: ${await r.text()}`);
      const data=await r.json();
      imageUrl = data?.data?.[0]?.url || (data?.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : '');
    }else if(imageProvider==='gemini'){
      const endpoint=`${baseUrl}/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body={
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{responseModalities:['TEXT','IMAGE']}
      };
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok) throw new Error(`gemini image ${r.status}: ${await r.text()}`);
      const data=await r.json();
      const parts=data?.candidates?.[0]?.content?.parts||[];
      const inline=parts.find(p=>p.inlineData?.data)?.inlineData?.data;
      if(inline) imageUrl=`data:image/png;base64,${inline}`;
    }

    if(!imageUrl) throw new Error('未从响应中解析到图片，请检查模型是否支持图片输出');
    document.getElementById('imageOut').innerHTML=`<img src="${imageUrl}" alt="generated"/>`;
    switchStep(4);
  }catch(e){alert(e.message||String(e));}
};

window.generateVideo=async()=>{
  try{
    const {baseUrl,apiKey,videoModel}=getCfg();
    if(!baseUrl||!apiKey||!videoModel) throw new Error('请先配置 BaseURL/APIKey/VideoModel');
    const shots=parseShots(document.getElementById('storyboard').value);
    if(shots.length!==9) throw new Error('需要9条镜头');
    const roleCard=document.getElementById('roleCard').value.trim();
    const prompt=`${roleCard}\nThe video plays out in a continuous 9-part sequence:\n${shots.map((s,i)=>`Part ${i+1}: ${s}`).join('\n')}`;
    const r=await fetch(`${baseUrl}/videos/generations`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify({model:videoModel,prompt})
    });
    const t=await r.text();
    const out=document.getElementById('videoResult');
    if(!r.ok){ out.textContent=`ERROR ${r.status}\n${t}`; return; }
    try{ out.textContent=JSON.stringify(JSON.parse(t),null,2);}catch{ out.textContent=t; }
  }catch(e){alert(e.message||String(e));}
};

window.buildCurl=()=>{
  const sid=document.getElementById('sid').value.trim();
  const stoken=document.getElementById('stoken').value.trim();
  const curl=`curl -X POST 'https://api.coze.cn/v1/workflow/run' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ${sid}:${stoken}' \\\n  -H 'X-Service-Desk-Id: ${sid}' \\\n  -H 'X-Service-Desk-Token: ${stoken}' \\\n  -d '{"input":"<your_request_payload_here>"}'`;
  document.getElementById('curlOut').textContent=curl;
};

const THEME_KEY='ai_video_studio_theme_v1';
let currentStep=1;

function stepClasses(step, active){
  const map={
    1:['bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300','hover:bg-indigo-100 dark:hover:bg-indigo-500/30'],
    2:['bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300','hover:bg-violet-100 dark:hover:bg-violet-500/30'],
    3:['bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300','hover:bg-emerald-100 dark:hover:bg-emerald-500/30'],
    4:['bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300','hover:bg-cyan-100 dark:hover:bg-cyan-500/30'],
    5:['bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300','hover:bg-rose-100 dark:hover:bg-rose-500/30'],
  };
  return active? map[step][0] : `bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300 ${map[step][1]}`;
}

function switchStep(step){
  currentStep=step;
  document.querySelectorAll('.step-panel').forEach(el=>{
    const show=Number(el.dataset.panel)===step;
    el.classList.toggle('hidden',!show);
  });
  document.querySelectorAll('.step-btn').forEach(btn=>{
    const s=Number(btn.dataset.step);
    btn.className=`step-btn rounded-xl px-3 py-2 font-medium text-left transition ${stepClasses(s,s===step)}`;
  });
  window.scrollTo({top:0,behavior:'smooth'});
}

function initStepper(){
  document.querySelectorAll('.step-btn').forEach(btn=>{
    btn.addEventListener('click',()=>switchStep(Number(btn.dataset.step)));
  });
  switchStep(1);
}

function applyTheme(theme){
  const isDark = theme==='dark';
  document.documentElement.classList.toggle('dark', isDark);
}

window.toggleTheme=()=>{
  const next=document.documentElement.classList.contains('dark')?'light':'dark';
  localStorage.setItem(THEME_KEY,next);
  applyTheme(next);
};

window.openSettings=()=>{
  document.getElementById('settingsModal')?.classList.remove('hidden');
};

window.closeSettings=()=>{
  document.getElementById('settingsModal')?.classList.add('hidden');
};

document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape') closeSettings();
});

(function initTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  if(saved==='dark' || saved==='light') return applyTheme(saved);
  const prefersDark=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark?'dark':'light');
})();

loadCfg();
initStepper();
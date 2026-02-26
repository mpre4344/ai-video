const LS_KEY='ai_video_studio_cfg_v1';

function loadCfg(){
  const raw=localStorage.getItem(LS_KEY);
  const cfg=raw?JSON.parse(raw):{};
  ['baseUrl','apiKey','chatModel','videoModel'].forEach(k=>{
    const el=document.getElementById(k); if(el) el.value=cfg[k]||'';
  });
  return cfg;
}

function getCfg(){
  return {
    baseUrl:document.getElementById('baseUrl').value.trim().replace(/\/$/,''),
    apiKey:document.getElementById('apiKey').value.trim(),
    chatModel:document.getElementById('chatModel').value.trim(),
    videoModel:document.getElementById('videoModel').value.trim(),
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
  }catch(e){alert(e.message||String(e));}
};

window.buildGridPrompt=()=>{
  const summary=document.getElementById('summary').value.trim();
  const shots=parseShots(document.getElementById('storyboard').value);
  if(shots.length!==9) return alert('请先准备9条镜头');
  const txt=`根据${summary}，生成一张具有凝聚力的3×3网格图像，包含同一环境中的9个不同摄像机镜头，严格保持人物/物体、服装和光线一致性，8K分辨率，16:9画幅。\n${shots.map((s,i)=>`镜头${String(i+1).padStart(2,'0')}：${s}`).join('\n')}\n最终必须是九宫格，每个格子比例为16:9。`;
  document.getElementById('gridPrompt').value=txt;
};

window.splitGrid=async()=>{
  const f=document.getElementById('gridImage').files?.[0];
  if(!f) return alert('先上传九宫格图片');
  const img=new Image(); img.src=URL.createObjectURL(f); await img.decode();
  const w=Math.floor(img.width/3), h=Math.floor(img.height/3);
  const wrap=document.getElementById('pieces'); wrap.innerHTML='';
  for(let r=0;r<3;r++) for(let c=0;c<3;c++){
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    cv.getContext('2d').drawImage(img,c*w,r*h,w,h,0,0,w,h);
    const url=cv.toDataURL('image/png');
    const a=document.createElement('a'); a.href=url; a.download=`panel_${r*3+c+1}.png`;
    const im=document.createElement('img'); im.src=url; a.appendChild(im); wrap.appendChild(a);
  }
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

loadCfg();
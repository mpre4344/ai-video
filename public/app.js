function cfg(){
  return {
    baseUrl: document.getElementById('baseUrl').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim(),
  }
}

function parseShots(text){
  const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
  const shots = [];
  for(const l of lines){
    const m = l.match(/^镜头\d{2}[:：]\s*(.*)$/);
    if(m) shots.push(m[1]);
  }
  return shots;
}

async function post(url, body){
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return r.json();
}

window.generateStoryboard = async () => {
  const data = await post('/api/storyboard/generate', {
    ...cfg(),
    script: document.getElementById('script').value,
    styleHint: document.getElementById('styleHint').value
  });
  if(!data.ok) return alert(data.error);
  document.getElementById('storyboard').value = data.storyboard;
}

window.buildGridPrompt = async () => {
  const shots = parseShots(document.getElementById('storyboard').value);
  const data = await post('/api/grid/prompt', {summary: document.getElementById('summary').value, shots});
  if(!data.ok) return alert(data.error);
  document.getElementById('gridPrompt').value = data.prompt;
}

window.splitGrid = async () => {
  const input = document.getElementById('gridImage');
  const file = input.files[0];
  if(!file) return alert('先上传九宫格图片');

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  const w = img.width, h = img.height;
  const cw = Math.floor(w / 3), ch = Math.floor(h / 3);
  const box = document.getElementById('pieces');
  box.innerHTML = '';

  for(let r=0;r<3;r++){
    for(let c=0;c<3;c++){
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, c*cw, r*ch, cw, ch, 0, 0, cw, ch);
      const url = canvas.toDataURL('image/png');

      const a = document.createElement('a');
      a.href = url; a.download = `panel_${r*3+c+1}.png`;
      const thumb = document.createElement('img');
      thumb.src = url;
      a.appendChild(thumb);
      box.appendChild(a);
    }
  }
}

window.generateVideo = async () => {
  const shots = parseShots(document.getElementById('storyboard').value);
  const data = await post('/api/video/generate', {
    ...cfg(),
    roleCard: document.getElementById('roleCard').value,
    shots
  });
  document.getElementById('videoResult').textContent = JSON.stringify(data, null, 2);
}

window.buildCurl = async () => {
  const data = await post('/api/tool/helpdesk-curl', {
    serviceDeskId: document.getElementById('sid').value,
    serviceDeskToken: document.getElementById('stoken').value
  });
  document.getElementById('curlOut').textContent = data.curl;
}

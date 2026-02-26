import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

function requireConfig(body) {
  const { baseUrl, apiKey, model } = body || {};
  if (!baseUrl || !apiKey || !model) {
    throw new Error('Missing baseUrl/apiKey/model');
  }
  return { baseUrl, apiKey, model };
}

async function chatCompletion({ baseUrl, apiKey, model, messages, temperature = 0.7 }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

app.post('/api/storyboard/generate', async (req, res) => {
  try {
    const cfg = requireConfig(req.body);
    const { script, styleHint = '' } = req.body;
    const prompt = `你是电影分镜导演。根据以下剧情生成连续9镜头，格式必须严格为：\n镜头01：...\n...\n镜头09：...\n要求同一场景同一时间轴，动作和情绪连续推进，人物一致。\n剧情：${script}\n风格参考：${styleHint}`;

    const content = await chatCompletion({
      ...cfg,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ ok: true, storyboard: content });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/grid/prompt', (req, res) => {
  try {
    const { summary = '', shots = [] } = req.body;
    if (!Array.isArray(shots) || shots.length !== 9) {
      throw new Error('shots must be 9 items');
    }
    const text = `根据${summary}，生成一张具有凝聚力的3×3网格图像，包含同一环境中的9个不同镜头，严格保持人物/服装/光线一致性，8K分辨率，16:9画幅。\n${shots.map((s, i) => `镜头${String(i + 1).padStart(2, '0')}：${s}`).join('\n')}\n最终必须是九宫格，且每个格子比例16:9。`;
    res.json({ ok: true, prompt: text });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/video/generate', async (req, res) => {
  try {
    const cfg = requireConfig(req.body);
    const { roleCard = '', shots = [] } = req.body;
    if (!Array.isArray(shots) || shots.length !== 9) throw new Error('shots must be 9 items');

    const videoPrompt = `${roleCard}\nThe video plays out in a continuous 9-part sequence:\n${shots
      .map((s, i) => `Part ${i + 1}: ${s}`)
      .join('\n')}`;

    const endpoint = `${cfg.baseUrl.replace(/\/$/, '')}/videos/generations`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({ model: cfg.model, prompt: videoPrompt })
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`Video API ${r.status}: ${text}`);
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.json({ ok: true, requestPrompt: videoPrompt, result: data });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/image/split-grid', upload.single('image'), async (req, res) => {
  // 浏览器端有完整切图实现；服务端返回提示供联调
  res.json({ ok: true, note: 'Use browser-side Canvas splitter in public/app.js for 3x3 equal slicing.' });
});

app.post('/api/tool/helpdesk-curl', (req, res) => {
  const { serviceDeskId, serviceDeskToken } = req.body;
  const curl = `curl -X POST 'https://api.coze.cn/v1/workflow/run' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ${serviceDeskId}:${serviceDeskToken}' \\\n  -H 'X-Service-Desk-Id: ${serviceDeskId}' \\\n  -H 'X-Service-Desk-Token: ${serviceDeskToken}' \\\n  -d '{"input":"<your_request_payload_here>"}'`;
  res.json({ ok: true, curl });
});

app.listen(port, () => {
  console.log(`video-studio-web running at http://localhost:${port}`);
});
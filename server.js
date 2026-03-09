const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const PRIZES_FILE = path.join(DATA_DIR, 'prizes.json');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 默认奖项配置
const DEFAULT_PRIZES = [
  { id: 1, name: '一等奖', description: '现金大奖 888元', probability: 2, color: '#FF0000', remaining: 1, total: 1 },
  { id: 2, name: '二等奖', description: '现金红包 388元', probability: 5, color: '#FF4500', remaining: 3, total: 3 },
  { id: 3, name: '三等奖', description: '现金红包 188元', probability: 10, color: '#FF8C00', remaining: 5, total: 5 },
  { id: 4, name: '四等奖', description: '精美礼品一份', probability: 20, color: '#FFD700', remaining: 20, total: 20 },
  { id: 5, name: '五等奖', description: '优惠券 50元', probability: 30, color: '#FFA500', remaining: 50, total: 50 },
  { id: 0, name: '谢谢参与', description: '感谢您的参与', probability: 33, color: '#999999', remaining: -1, total: -1 }
];

// 默认系统配置
const DEFAULT_CONFIG = {
  title: '元宵喜乐会',
  subtitle: '女神礼遇节',
  brandName: '聚利源',
  slogan: '聚势起航 利泽共享',
  tagline: '活动狂欢 现金好礼',
  surpriseText: '惊喜不断',
  allowRepeat: false, // 是否允许重复抽奖
  adminPassword: 'admin888',
  activityEnabled: true
};

// 读取数据
function readJSON(filePath, defaultData) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`读取文件失败: ${filePath}`, e);
  }
  writeJSON(filePath, defaultData);
  return defaultData;
}

// 写入数据
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// 初始化数据
let prizes = readJSON(PRIZES_FILE, DEFAULT_PRIZES);
let records = readJSON(RECORDS_FILE, []);
let config = readJSON(CONFIG_FILE, DEFAULT_CONFIG);

// ============ API 路由 ============

// 获取活动配置（前端用）
app.get('/api/config', (req, res) => {
  const { adminPassword, ...publicConfig } = config;
  res.json({ success: true, data: publicConfig });
});

// 获取奖项列表（前端用）
app.get('/api/prizes', (req, res) => {
  const publicPrizes = prizes.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color
  }));
  res.json({ success: true, data: publicPrizes });
});

// 抽奖接口
app.post('/api/lottery', (req, res) => {
  const { userName, userPhone, userAvatar } = req.body;

  if (!config.activityEnabled) {
    return res.json({ success: false, message: '活动已结束，感谢您的参与！' });
  }

  if (!userName || !userPhone) {
    return res.json({ success: false, message: '请填写姓名和手机号' });
  }

  // 检查是否已抽过奖
  if (!config.allowRepeat) {
    const existing = records.find(r => r.userPhone === userPhone);
    if (existing) {
      return res.json({
        success: false,
        message: '您已经参与过抽奖了',
        data: { prize: prizes.find(p => p.id === existing.prizeId) }
      });
    }
  }

  // 抽奖逻辑
  const prize = drawPrize();

  // 记录抽奖
  const record = {
    id: uuidv4(),
    userName,
    userPhone,
    userAvatar: userAvatar || '',
    prizeId: prize.id,
    prizeName: prize.name,
    prizeDescription: prize.description,
    time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    timestamp: Date.now()
  };

  records.push(record);
  writeJSON(RECORDS_FILE, records);

  // 更新剩余数量
  if (prize.remaining > 0) {
    const idx = prizes.findIndex(p => p.id === prize.id);
    if (idx !== -1) {
      prizes[idx].remaining--;
      writeJSON(PRIZES_FILE, prizes);
    }
  }

  res.json({
    success: true,
    data: {
      prize: {
        id: prize.id,
        name: prize.name,
        description: prize.description,
        color: prize.color
      },
      record
    }
  });
});

// 抽奖算法
function drawPrize() {
  // 构建可用奖项池（排除已发完的奖项）
  const availablePrizes = prizes.filter(p => p.remaining !== 0); // remaining=-1 表示无限

  if (availablePrizes.length === 0) {
    return { id: 0, name: '谢谢参与', description: '奖品已发完', color: '#999999' };
  }

  // 计算总概率
  const totalProb = availablePrizes.reduce((sum, p) => sum + p.probability, 0);

  // 随机数
  let random = Math.random() * totalProb;
  let cumulative = 0;

  for (const prize of availablePrizes) {
    cumulative += prize.probability;
    if (random <= cumulative) {
      return prize;
    }
  }

  // 兜底返回最后一个
  return availablePrizes[availablePrizes.length - 1];
}

// ============ 管理后台 API ============

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === config.adminPassword) {
    res.json({ success: true, token: 'admin-' + Date.now() });
  } else {
    res.json({ success: false, message: '密码错误' });
  }
});

// 获取所有奖项（管理员）
app.get('/api/admin/prizes', (req, res) => {
  res.json({ success: true, data: prizes });
});

// 更新奖项
app.put('/api/admin/prizes', (req, res) => {
  const newPrizes = req.body.prizes;
  if (!newPrizes || !Array.isArray(newPrizes)) {
    return res.json({ success: false, message: '无效的奖项数据' });
  }
  prizes = newPrizes;
  writeJSON(PRIZES_FILE, prizes);
  res.json({ success: true, message: '奖项更新成功' });
});

// 更新单个奖项
app.put('/api/admin/prizes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = prizes.findIndex(p => p.id === id);
  if (idx === -1) {
    return res.json({ success: false, message: '奖项不存在' });
  }
  prizes[idx] = { ...prizes[idx], ...req.body };
  writeJSON(PRIZES_FILE, prizes);
  res.json({ success: true, message: '奖项更新成功' });
});

// 获取中奖记录
app.get('/api/admin/records', (req, res) => {
  const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
  res.json({ success: true, data: sortedRecords });
});

// 清空中奖记录
app.delete('/api/admin/records', (req, res) => {
  records = [];
  writeJSON(RECORDS_FILE, records);
  // 重置奖项数量
  prizes = prizes.map(p => ({ ...p, remaining: p.total }));
  writeJSON(PRIZES_FILE, prizes);
  res.json({ success: true, message: '记录已清空，奖项数量已重置' });
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
  const stats = {
    totalParticipants: records.length,
    prizeStats: prizes.map(p => ({
      id: p.id,
      name: p.name,
      total: p.total,
      remaining: p.remaining,
      used: p.total === -1 ? records.filter(r => r.prizeId === p.id).length : (p.total - p.remaining),
      probability: p.probability
    }))
  };
  res.json({ success: true, data: stats });
});

// 获取系统配置（管理员）
app.get('/api/admin/config', (req, res) => {
  res.json({ success: true, data: config });
});

// 更新系统配置
app.put('/api/admin/config', (req, res) => {
  config = { ...config, ...req.body };
  writeJSON(CONFIG_FILE, config);
  res.json({ success: true, message: '配置更新成功' });
});

// 导出中奖记录为 CSV
app.get('/api/admin/export', (req, res) => {
  const BOM = '\uFEFF';
  let csv = BOM + '序号,姓名,手机号,奖项,奖品描述,抽奖时间\n';
  records.forEach((r, i) => {
    csv += `${i + 1},${r.userName},${r.userPhone},${r.prizeName},${r.prizeDescription},${r.time}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=lottery_records.csv');
  res.send(csv);
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 抽奖系统已启动！`);
  console.log(`📱 抽奖页面: http://localhost:${PORT}`);
  console.log(`🔧 管理后台: http://localhost:${PORT}/admin`);
  console.log(`📊 默认管理密码: ${config.adminPassword}`);
});

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Data
  let tables = [
    {
      id: "table_1",
      name: "示例表格",
      columns: [
        { id: "col_1", name: "名称", type: "text", sort: 0 },
        { id: "col_2", name: "状态", type: "select", sort: 1, config: { options: [{ id: "opt_1", name: "待办", color: "blue" }, { id: "opt_2", name: "进行中", color: "orange" }] } },
      ],
      views: [
        { id: "view_1", name: "表格视图", type: "grid", is_default: true, config: {} }
      ],
      rows: [
        { id: "row_1", data: { col_1: "任务 1", col_2: "opt_1" }, sort: 0 }
      ]
    }
  ];

  let departments = [
    { dept_id: "dept_1", dept_name: "研发部" },
    { dept_id: "dept_2", dept_name: "市场部" },
    { dept_id: "dept_3", dept_name: "人事部" }
  ];

  // API Routes
  const API_BASE = "/console/api/apps/multi/dimensional";

  // 获取部门
  app.get("/console/api/workspaces/current/depts", (req, res) => {
    res.json({ data: departments, message: "success" });
  });

  // 获取表格列表
  app.get(`${API_BASE}/tables`, (req, res) => {
    res.json({
      data: {
        list: tables.map(t => ({ ...t, rows: [] })), // List usually doesn't include rows
        total: tables.length,
        page: 1,
        page_size: 10
      },
      message: "success"
    });
  });

  // 获取表格详情
  app.get(`${API_BASE}/tables/:id`, (req, res) => {
    const table = tables.find(t => t.id === req.params.id);
    if (table) {
      res.json({ data: table, message: "success" });
    } else {
      res.status(404).json({ message: "Table not found" });
    }
  });

  // 获取行列表
  app.post(`${API_BASE}/tables/:id/rows`, (req, res) => {
    const table = tables.find(t => t.id === req.params.id);
    if (table) {
      res.json({
        data: {
          list: table.rows,
          total: table.rows.length,
          page: 1,
          page_size: 100
        },
        message: "success"
      });
    } else {
      res.status(404).json({ message: "Table not found" });
    }
  });

  // 获取字段类型选项
  app.get(`${API_BASE}/tables/field-types`, (req, res) => {
    res.json({
      data: [
        { id: "text", name: "文本" },
        { id: "number", name: "数字" },
        { id: "select", name: "单选" },
        { id: "multi_select", name: "多选" },
        { id: "date", name: "日期" },
        { id: "user", name: "用户" },
        { id: "attachment", name: "附件" },
        { id: "checkbox", name: "复选框" },
        { id: "formula", name: "公式" },
      ],
      message: "success"
    });
  });

  // 获取视图类型选项
  app.get(`${API_BASE}/tables/view-types`, (req, res) => {
    res.json({
      data: [
        { id: "grid", name: "表格" },
        { id: "kanban", name: "看板" },
        { id: "gallery", name: "画册" },
        { id: "calendar", name: "日历" },
        { id: "gantt", name: "甘特图" },
      ],
      message: "success"
    });
  });

  // 获取角色
  app.get("/console/api/workspaces/current/roles", (req, res) => {
    res.json({ data: [{ role_id: "role_1", role_name: "管理员" }, { role_id: "role_2", role_name: "编辑者" }], message: "success" });
  });

  // 获取成员
  app.get("/console/api/workspaces/current/members", (req, res) => {
    res.json({ accounts: [{ account_id: "user_1", account_name: "管理员", avatar: "" }] });
  });

  // 获取筛选条件选项
  app.get(`${API_BASE}/tables/filter-operators`, (req, res) => {
    res.json({ data: [{ id: "contains", name: "包含" }, { id: "is", name: "是" }, { id: "empty", name: "为空" }], message: "success" });
  });

  // 获取排序方向选项
  app.get(`${API_BASE}/tables/sort-orders`, (req, res) => {
    res.json({ data: [{ id: "asc", name: "升序" }, { id: "desc", name: "降序" }], message: "success" });
  });

  // 获取表格权限选项
  app.get(`${API_BASE}/tables/collaborator-roles`, (req, res) => {
    res.json({ data: [{ id: "admin", name: "管理员" }, { id: "editor", name: "编辑者" }, { id: "viewer", name: "查看者" }], message: "success" });
  });

  // 获取撤回/恢复状态
  app.get(`${API_BASE}/tables/:id/undo-redo-status`, (req, res) => {
    res.json({ data: { can_undo: false, can_redo: false }, message: "success" });
  });

  // 获取单元格评论数量
  app.get(`${API_BASE}/tables/:id/comments/counts`, (req, res) => {
    res.json({ data: [], message: "success" });
  });

  // 获取模版
  app.get(`${API_BASE}/tables/templates`, (req, res) => {
    res.json({ data: [], message: "success" });
  });

  // 获取查找引用条件选项
  app.get(`${API_BASE}/tables/search-conditions`, (req, res) => {
    res.json({ data: [], message: "success" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    // Server running
  });
}

startServer();

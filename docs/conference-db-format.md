# 会议论文数据库格式

SciPhant 支持导入外部 `.db` 文件来添加会议论文数据。本文档说明如何构建符合要求的数据库文件。

## Schema

数据库需要包含 `conferences` 和 `papers` 两张表。

### conferences 表

| 列 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | INTEGER PRIMARY KEY | 是 | 会议 ID |
| `short_name` | TEXT | 是 | 会议简称（如 `CVPR`, `ICLR`） |
| `year` | INTEGER | 是 | 年份（如 `2025`） |
| `full_name` | TEXT | 是 | 会议全称（如 `IEEE/CVF Conference on Computer Vision and Pattern Recognition`） |
| `location` | TEXT | 否 | 举办地点 |
| `published_date` | TEXT | 否 | 发布日期 |

约束：`(short_name, year)` 唯一。

### papers 表

| 列 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | TEXT PRIMARY KEY | 是 | 论文唯一标识 |
| `conference_id` | INTEGER | 是 | 关联 conferences.id |
| `title` | TEXT | 是 | 论文标题 |
| `authors` | TEXT | 是 | 作者列表，JSON 数组格式（如 `["Alice", "Bob"]`） |
| `abstract` | TEXT | 是 | 摘要 |
| `pdf_url` | TEXT | 否 | PDF 下载链接 |
| `supp_url` | TEXT | 否 | 补充材料链接 |
| `arxiv_url` | TEXT | 否 | arXiv 链接 |
| `bibtex` | TEXT | 否 | BibTeX 引用 |
| `pages` | TEXT | 否 | 页码范围 |
| `track` | TEXT | 否 | 所属 Track |
| `detail_url` | TEXT | 否 | 论文详情页链接 |

## 示例

使用 `sqlite3` 创建：

```bash
sqlite3 my_conference.db <<'SQL'
CREATE TABLE conferences (
    id INTEGER PRIMARY KEY,
    short_name TEXT NOT NULL,
    year INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    location TEXT,
    published_date TEXT,
    UNIQUE(short_name, year)
);

CREATE TABLE papers (
    id TEXT PRIMARY KEY,
    conference_id INTEGER NOT NULL REFERENCES conferences(id),
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '[]',
    abstract TEXT,
    pdf_url TEXT,
    supp_url TEXT,
    arxiv_url TEXT,
    bibtex TEXT,
    pages TEXT,
    track TEXT,
    detail_url TEXT
);

INSERT INTO conferences VALUES (1, 'CVPR', 2025, 'IEEE/CVF Conference on Computer Vision and Pattern Recognition 2025', NULL, NULL);

INSERT INTO papers VALUES ('cvpr2025_001', 1, 'Example Paper Title', '["Alice Zhang", "Bob Li"]', 'This is the abstract of the paper.', 'https://example.com/paper.pdf', NULL, 'https://arxiv.org/abs/2501.00001', NULL, '1-10', 'Main Track', 'https://example.com/paper/001');
SQL
```

## 导入

1. 在 SciPhant 中切换至会议模式
2. 点击侧边栏「导入会议」
3. 选择 `.db` 文件
4. 勾选要导入的会议，处理冲突（如有）
5. 确认导入

## 验证规则

导入时 SciPhant 会检查：

- `conferences` 和 `papers` 两张表必须存在
- 必填列必须存在：`conferences` 需要 `id, short_name, year, full_name`，`papers` 需要 `id, conference_id, title, authors, abstract`
- 不在已知列名中的列会产生警告（但不阻止导入）

## 注意事项

- `authors` 列必须是合法的 JSON 数组字符串
- `id` 列建议使用不会冲突的格式（如 `cvpr2025_001`），避免不同来源的论文 ID 冲突
- 如果导入的会议与已有会议同名同年，需要选择覆盖或跳过

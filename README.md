# QA Agent

## Repo

```
qa-agent/
├── agents/
├── project-docs/  
├── skills/
│   ├── review-skill-quality.md
│   ├── analyze-project-docs.md
│   ├── critique-analysis.md
├── roles/
│   ├── QA-Leader.md
│   ├── QA-Reviewer.md
│   └── QA-Analyst.md
└── package.json
```

## 2. Installation

```bash
npm install
cp .env.example .env # paste API key into .env
```

## 3. Check before running

```bash
npm run models
npm run hello
```

## 4. Run order

```bash
npm run hello
npm run leader
npm run analyst
node agents/approve.js qa-analyst "TuyenDV"
npm run pipeline
npm run explorer -- --show
```

## 5. What this package doesn't do

- Don't generate test cases
- Don't run Playwright spec 
- Don't touch `outputs/` 

## 6. Useful flags

| Flag | Description |
|---|---|
| `--no-cache` | Skip cache, call API for real |
| `--show` | Explorer opens browser |

## 7. Memory structure

| Layer | Location | Can delete? |
|---|---|---|
| Working memory | RAM, `contents` array | disappears when run ends |
| Workflow state | `.state/workflow.json` | delete to restart workflow |
| Knowledge | `knowledge/*.md` | it's a product, don't delete |
| Cache | `.state/cache/` | delete freely, only costs quota |

## 8. Full workflow

```
                QA Leader Agent
                      │
     ┌────────────────┼────────────────┐
     │                │                │
     ▼                ▼                ▼
Review Task      Assign Agent     Final Review
     │                │                │
     └────────────────┼────────────────┘
                      ▼
              QA Analyst Agent
                      │
             Analyze Requirement
                      │
                      ▼
              Generate Analysis
                      │
                      ▼
                 QA Leader
              Review / Approve
```
# two.desk — System-level Instructions

System-level rules that apply to all work on this project. Project-specific details live in `CLAUDE.md`.

---

## Deployment Gate — MANDATORY

**Do NOT push code to GitHub or trigger Vercel deployment until the user explicitly approves.**

Workflow:
1. Make changes locally
2. Test locally (`npm run dev`)
3. Commit locally (`git commit`)
4. **STOP** and ask user: "Ready to push to main and deploy to Vercel?"
5. **Only after user approves**, run `git push origin main`

---

## Code Review Checklist

Before committing, verify:

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] Dev server runs: `npm run dev`
- [ ] No console errors
- [ ] Core functionality tested (submit a debate question)
- [ ] Markdown renders (no raw `##` or `**` tags visible)
- [ ] Cost panel updates in real-time
- [ ] Stop button works (halts stream)
- [ ] Smart scroll works (doesn't jump when reading)

---

## File Change Rules

### `lib/claude.ts`
- Streaming interface between frontend and Anthropic SDK
- **Change only if:** Adding token tracking, changing model, adjusting max_tokens, or handling new event types
- **Test:** Run debate, verify text chunks and usage events flow to frontend

### `lib/orchestrator.ts`
- Debate orchestration, consensus logic, turn management
- **Change only if:** Modifying debate loop, consensus rules, or token tracking
- **Test:** Verify both agents talk, consensus detects correctly, tokens accumulate
- **Constraints:** Keep `STANCE` block parsing compatible with agent Markdown files

### `lib/market-data.ts`
- Technical indicator calculations
- **Change if:** Adding indicators, changing source, or improving calculations
- **Test:** Run `npm run dev`, submit a question with a ticker, verify indicators appear in agent responses

### `app/page.tsx`
- Main UI and user interaction
- **Change if:** Adding features (cost panel is done), fixing bugs, or improving UX
- **Test:** `npm run dev`, test all UI interactions (submit, stop, scroll, markdown rendering)

### `app/api/debate/route.ts`
- SSE endpoint
- **Change only if:** Modifying event format, error handling, or stream setup
- **Test:** Curl the endpoint directly, verify event stream format

### `agents/agent-*.md`
- Agent personas
- **Change anytime:** Edit philosophy, tone, indicators, risk tolerance
- **Constraint:** Keep `STANCE` block format intact (parser is picky)

### `profile/user-profile.md`
- User trading profile (edited by trader, not developer)
- **Change only if:** Adding new profile structure or instructions
- **Test:** Agents should reference profile correctly in responses

### `next.config.js`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`
- Build and tool configuration
- **Change only if:** New build issues, new TypeScript rules, new Tailwind plugins
- **Test:** `npm run build` succeeds

### `.gitignore`
- Exclude files from source control
- **Ensure:** `.env.local` is always ignored (never commit API keys)

---

## Testing Protocol

### Local testing (before commit)
```bash
# 1. Type check
npx tsc --noEmit

# 2. Build
npm run build

# 3. Dev server
npm run dev
# Then manually test in browser:
#   - Submit a question
#   - Verify debate streams live
#   - Verify cost panel updates
#   - Verify markdown renders
#   - Click stop button mid-stream
```

### Vercel testing (after push, before user approval)
- Visit deployment preview link
- Run same tests as local
- Check browser DevTools console for errors

---

## Token Usage Tracking

The system tracks Claude API tokens in real-time:

**Flow:**
1. `streamAgent()` in `lib/claude.ts` yields `AgentChunk` with `kind: 'usage'` after stream ends
2. `runDebate()` in `lib/orchestrator.ts` accumulates tokens and emits `{ type: 'usage', totalInputTokens, totalOutputTokens }`
3. `app/page.tsx` listens for usage events and updates cost panel
4. Cost = `(inputTokens × $3 + outputTokens × $15) / 1,000,000` (Claude Sonnet 4.5 pricing)

**Monitoring:**
- Check real-time cost panel during debates
- Anthropic dashboard: https://console.anthropic.com/account/usage for billing
- Review monthly spend in project settings

---

## Git Workflow

**Branch:** Always work on `main` (no feature branches for this project)

**Commits:**
- Atomic: one logical change per commit
- Message: clear, imperative ("Fix smart scroll" not "Fixed scrolling issue")
- No co-authored commits (unless pair programming)

**Before pushing:**
- [ ] All tests pass locally
- [ ] No console errors
- [ ] Build succeeds
- [ ] Ask user for approval

---

## Vercel Deployment

**Auto-deploy trigger:** Every push to `main` branch

**Deploy checklist:**
- [ ] GitHub repo up-to-date with local changes
- [ ] Vercel environment variables set (ANTHROPIC_API_KEY)
- [ ] Build logs show no errors
- [ ] Preview/production looks correct
- [ ] Cost panel works
- [ ] API streaming works (test in DevTools Network tab)

**Rollback:** If Vercel deployment fails, check:
1. Build logs on Vercel dashboard
2. Environment variables set correctly
3. Local build passes (`npm run build`)
4. Latest commit on main doesn't have issues

---

## Secrets Management

**API Keys:**
- `ANTHROPIC_API_KEY`: Never in source code, only in `.env.local` (local) or Vercel env vars (production)

**Files to never commit:**
- `.env.local` (has `.env.local.example` instead)
- Any `*.key`, `*.pem`, `*.secret` files
- `node_modules/`
- `.next/`

**Git hooks:** (Optional) Add pre-commit hook to catch secrets:
```bash
# .git/hooks/pre-commit
grep -r "sk-ant-" . --exclude-dir=node_modules && echo "ERROR: API key found in source" && exit 1
```

---

## Performance & Cost Optimization

### Token usage
- Each debate round uses ~2–3K tokens per agent (rough estimate)
- 10 rounds = ~40–60K tokens total
- Cost: ~$0.25–$0.50 per debate
- Monitor via Anthropic dashboard

### Vercel limits
- 5-minute timeout (requires Pro, $20/mo)
- Hobby tier = 10-second limit (not enough for debates)

### Yahoo Finance limits
- ~200 free API calls per day (no auth needed)
- If hitting limits, add caching in `lib/market-data.ts`

---

## Debugging Checklist

**Debate doesn't start:**
- [ ] Check Anthropic API key in `.env.local`
- [ ] Check network tab for `/api/debate` POST request
- [ ] Check browser DevTools console for errors
- [ ] Check server terminal for errors

**Agents go silent mid-debate:**
- [ ] Check token usage — may have hit API limit
- [ ] Check Vercel logs (if deployed)
- [ ] Restart dev server: `npm run dev`

**Wrong agent answers:**
- [ ] Edit agent personas in `agents/*.md`
- [ ] Check if market data is fetching (look for "Fetching market data" system message)
- [ ] Verify user profile makes sense (`profile/user-profile.md`)

**UI broken (markdown not rendering):**
- [ ] Check DevTools console for React errors
- [ ] Verify `react-markdown` and `remark-gfm` installed: `npm list react-markdown`
- [ ] Rebuild: `npm run build` then `npm run dev`

**Cost panel always shows $0:**
- [ ] Verify `lib/orchestrator.ts` emits usage events
- [ ] Check DevTools Network tab — usage events present in SSE stream?
- [ ] Verify `app/page.tsx` handleEvent() updates cost state

---

## Release Management

**Versioning:** Semantic versioning in `CLAUDE.md`
- `0.1.0` = initial beta
- `0.2.0` = new features (debate history, custom indicators, etc.)
- `1.0.0` = stable, feature-complete

**Steps for a release:**
1. Make changes
2. Update version in `CLAUDE.md` → **Current versions**
3. Commit: `git commit -m "Bump version to X.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push origin main --tags`
6. Vercel auto-deploys on `main` push

---

## Documentation Maintenance

- Keep `CLAUDE.md` in sync with actual code (file structure, environment variables, features)
- Keep `README.md` user-friendly (what users care about)
- Keep `system.md` (this file) for development rules and workflows
- Update after significant changes (new endpoints, refactors, new features)

---

## Long-term TODOs (not blocking)

- [ ] Add debate history (localStorage or Supabase)
- [ ] Custom indicator support (agents can request additional calculations)
- [ ] Intraday data (Polygon or Alpaca integration)
- [ ] Rate limiting (cloudflare, middleware)
- [ ] A/B testing agent personas
- [ ] User authentication (optional, for debate history)
- [ ] Export debate as PDF/JSON
- [ ] Mobile-responsive fixes (current: desktop-first)
- [ ] Accessibility improvements (ARIA labels, keyboard nav)


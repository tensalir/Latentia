# Loop Vesper — Founders Summary

**Funding request: AI media platform for Studio**

---

## The opportunity

Loop Vesper is a working AI media platform that lets Studio generate images and videos across multiple state-of-the-art models (Gemini Imagen, Veo, Kling) from a single project-based workspace. It includes cost tracking, prompt enhancement, and analytics out of the box.

We built it to replace Krea, which cost **€7,093 in the last six months** (see Appendix). At similar usage, Vesper's direct API costs would be roughly €900–1,700 for the same period.

Beyond cost, Vesper solves three problems Krea can't:

- **Analytics**: We capture every generation with full metadata. This lets us track what works and build institutional knowledge.
- **Prompt enhancement**: Claude improves prompts before generation, reducing wasted iterations.
- **Roadmap control**: We ship features when we need them, not when a vendor decides to.

---

## Strategic value: beyond one tool

Vesper isn't just a Krea replacement. Productionizing it creates organizational capability that extends far beyond Studio.

The API savings alone (~€10k/year) don't justify a €100k engineering hire. But building a platform like Vesper through an external agency would cost €80–120k, and when the project ends, they walk away. No maintenance, no iterations, no institutional knowledge. Every new tool starts from zero.

One engineer costs the same as one agency project, but they stay, they build more, and each subsequent tool becomes faster and cheaper because the patterns already exist.

### A testbed for Loop's build mindset

We want everyone at Loop to cultivate a builder mindset. Vesper is a real, working example of what that looks like: a business problem solved by building rather than buying. Taking it to production demonstrates the full arc from prototype to internal service.

### Infrastructure for future experiments

Right now, we have no clear path from "working prototype" to "production-ready tool." Every Tier 2 experiment faces the same gap: security hardening, SSO, monitoring, CI/CD. By productionizing Vesper, we develop the infrastructure, policies, and best practices that all future experiments can follow.

This isn't a one-time cost, but an investment in a repeatable path.

### Knowledge transfer by design

The senior engineer we hire won't work in isolation. Their job is to encode best practices into our AI development stack:

- **Documentation**: Patterns, security checklists, and deployment guides that anyone can follow
- **AI tooling**: MCP servers, skills, and rules that encode best practices directly into our vibecoding workflow
- **Shared ownership**: Creative Technology and other stakeholders learn alongside the engineer

If someone leaves, the knowledge stays. It's embedded in the tools, not locked in someone's head.

---

## What's built

The platform is functional and Studio + Product Design are already testing it:

- Multi-model generation (image + video) with real-time progress updates
- Project and session structure that mirrors campaign workflows
- AI-powered prompt enhancement (Claude)
- Cost tracking, rate limit monitoring, usage analytics
- Bookmarking, review workflows, community gallery

This is a feature-complete application running on Vercel. The missing piece is the production infrastructure to run it safely as an internal service.

---

## The gap

Moving from "working app on Vercel" to "production internal service" requires:

| Current state | Production target |
|---------------|-------------------|
| Vercel-hosted, public internet | Internal VM, SSO/VPN access only |
| Basic auth | Corporate SSO integration |
| Serverless (times out on long jobs) | Durable job queue with retries |
| Debug endpoints exposed | Hardened, audit-ready |

---

## The ask

**1. Hire one Senior Full-Stack Engineer** (AI-native)

The engineer's job is to harden the codebase and encode best practices for the rest of the organization. Profile: Next.js/TypeScript, strong backend, comfortable with AI-assisted workflows.

**2. IT partnership** (no additional headcount)

VM provisioning, SSO integration, network access, patching cadence. A detailed technical brief for IT is available.

**3. Infrastructure + API budget**

Internal hosting (VM or container), direct AI provider spend with monitoring, alerts, and cost caps.

---

## Timeline + ownership

6 to 10 weeks from engineer start to production deployment. The application works today; the work is infrastructure and hardening, not feature development.

| Function | Owner |
|----------|-------|
| Product direction, user access | Studio / Creative Technology |
| Application code, releases | Senior Engineer (new hire) |
| Infrastructure, SSO, patching | IT |
| Governance, cost controls | Data/AI team |

---

## Bottom line

One agency project costs €100k and leaves nothing behind. One engineer costs €100k and builds the foundation for everything that follows.

We're not funding a tool. We're funding the capability to build.

---

## Appendix: Cost comparison

### Actual Krea spend (Aug 2025 – Jan 2026)

| Period | Krea spend |
|--------|------------|
| August 2025 | €422 |
| September 2025 | €1,088 |
| October 2025 | €2,130 |
| November 2025 | €1,860 |
| December 2025 | €1,193 |
| January 2026 | €399 |
| **Total (6 months)** | **€7,093** |
| **Monthly average** | **€1,182** |

The October/November spike corresponds to the AI ATL video campaign and Gifting assets.

### Direct API pricing (what Vesper uses)

| Model | Use case | Cost |
|-------|----------|------|
| Gemini Imagen 3 | Image generation | ~$0.13 per image |
| Veo 3.1 Fast | Video generation | $0.15 per second |
| Kling 2.6 Standard | Video generation | $0.08 per second |

### Projected Vesper costs at different volumes

Assuming 60% images, 40% videos (5-second average):

| Monthly generations | Estimated API cost |
|---------------------|-------------------|
| 250 | ~€75 |
| 500 | ~€145 |
| 1,000 | ~€290 |
| 2,000 | ~€580 |

### Summary comparison

| | Krea (actual) | Vesper (projected) |
|---|---------------|-------------------|
| Monthly cost | €1,182 average | €145–290 (500–1000 gens) |
| Annual projection | ~€14,000 | ~€1,700–3,500 |
| Per-seat licensing | Yes | No |
| Usage analytics | None | Full metadata capture |

**Caveats:**
- Vesper projections assume similar generation volume to Krea. Actual volume is unknown since Krea provides no analytics.
- Costs scale with usage. Heavy campaign periods will cost more, but still less than Krea's flat markup.
- Infrastructure costs (hosting, engineer time) are separate from API costs.

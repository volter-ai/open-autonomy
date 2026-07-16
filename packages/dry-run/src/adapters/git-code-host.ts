import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CodeHostPort, PullRequest } from '../ports.ts';

// CodeHostPort backed by a REAL local bare repository: shas, merges, and
// release diffs are actual git ground truth, not a symbolic model. PR state
// (numbers, merged flags) lives in memory beside it — a twin-backed world can
// keep that half in a GitHub twin instead, over the same port contract.
//
// Everything is local disk; nothing here can reach a remote (there are none).

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export interface GitScenarioRepo {
  bare: string;
  work: string;
  headOf(branch: string): string;
  commitFile(branch: string, fromBranch: string, path: string, content: string, message: string): string;
}

// Create a bare "origin" plus a working clone, seeded with an initial tree on
// `defaultBranch` so diffs have a realistic base.
export function makeGitRepo(root: string, defaultBranch: string): GitScenarioRepo {
  const bare = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(bare, { recursive: true });
  git(dirname(bare), 'init', '--bare', '-b', defaultBranch, bare);
  git(dirname(bare), 'clone', bare, work);
  git(work, 'config', 'user.email', 'dry-run@local');
  git(work, 'config', 'user.name', 'dry-run');
  git(work, 'checkout', '-b', defaultBranch);
  writeFileSync(join(work, 'README.md'), 'seed\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'seed tree');
  git(work, 'push', 'origin', defaultBranch);
  return {
    bare,
    work,
    headOf: (branch) => git(bare, 'rev-parse', branch),
    commitFile(branch, fromBranch, path, content, message) {
      git(work, 'fetch', 'origin');
      const startPoint = git(work, 'branch', '-r', '--list', `origin/${branch}`) ? `origin/${branch}` : `origin/${fromBranch}`;
      git(work, 'checkout', '-B', branch, startPoint);
      const abs = join(work, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      git(work, 'add', '-A');
      git(work, 'commit', '-m', message);
      git(work, 'push', 'origin', `HEAD:${branch}`);
      return git(work, 'rev-parse', 'HEAD');
    },
  };
}

export interface GitCodeHost extends CodeHostPort {
  repo: GitScenarioRepo;
  developerImplements(input: {
    issueBranch: string;
    base: string;
    title: string;
    path: string;
    content: string;
  }): Promise<PullRequest>;
  mergePr(number: number): string;
}

export function gitCodeHost(repo: GitScenarioRepo): GitCodeHost {
  const prs: PullRequest[] = [];
  return {
    repo,
    async getBranchHead(branch) {
      return repo.headOf(branch);
    },
    async createBranch(branch, fromSha) {
      git(repo.bare, 'branch', '-f', branch, fromSha);
    },
    async listPullRequests(filter) {
      return prs.filter(
        (p) => p.base === filter.base && (filter.state === 'all' || !filter.state || p.state === filter.state),
      );
    },
    async openPullRequest(input) {
      const pr: PullRequest = {
        number: prs.length + 1,
        url: `local-git://pr/${prs.length + 1}`,
        head: input.head,
        base: input.base,
        title: input.title,
        state: 'open',
        merged: false,
      };
      prs.push(pr);
      return pr;
    },
    async listChangedPaths(base, head) {
      const out = git(repo.bare, 'diff', '--name-only', `${base}...${head}`);
      return out.length > 0 ? out.split('\n') : [];
    },
    // Scenario-side helpers: the simulated developer's actions.
    async developerImplements(input) {
      repo.commitFile(input.issueBranch, input.base, input.path, input.content, input.title);
      const pr: PullRequest = {
        number: prs.length + 1,
        url: `local-git://pr/${prs.length + 1}`,
        head: input.issueBranch,
        base: input.base,
        title: input.title,
        state: 'open',
        merged: false,
      };
      prs.push(pr);
      return pr;
    },
    mergePr(number) {
      const pr = prs.find((p) => p.number === number);
      if (!pr || pr.merged) throw new Error(`pr ${number} missing or already merged`);
      git(repo.work, 'fetch', 'origin');
      git(repo.work, 'checkout', '-B', pr.base, `origin/${pr.base}`);
      git(repo.work, 'merge', '--no-ff', '-m', `Merge pull request #${pr.number} from ${pr.head}`, `origin/${pr.head}`);
      git(repo.work, 'push', 'origin', `HEAD:${pr.base}`);
      pr.state = 'closed';
      pr.merged = true;
      pr.mergeCommitSha = git(repo.work, 'rev-parse', 'HEAD');
      return pr.mergeCommitSha;
    },
  };
}

import simpleGit, { SimpleGit } from 'simple-git';
import { Command } from 'commander';

// Interface for Git Commit info
interface GitCommit {
    hash: string;
    author: string;
    date: string;
    message: string;
    diff: string;
}

interface ApplyOptions {
    newAuthor?: string;
    newEmail?: string;
    newCommitter?: string;
    newCommitterEmail?: string;
}

// Class to handle Git operations
class GitLogger {
    private git: SimpleGit;
    private currentTime: string;
    private repoPath: string;

    constructor(repoPath: string, currentTime: string = new Date().toISOString()) {
        this.repoPath = repoPath;
        this.git = simpleGit(repoPath);
        this.currentTime = currentTime;
    }

    async getCommits(): Promise<GitCommit[]> {
        try {
            // Check if we're in a git repository
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                console.log(`Not a git repository: ${this.repoPath}`);
                return [];
            }

            // Get list of commits
            const log = await this.git.log();
            const commits: GitCommit[] = [];

            for (const commit of log.all) {
                // Get diff for this commit
                const diff = await this.git.show([commit.hash]);
                
                commits.push({
                    hash: commit.hash,
                    author: commit.author_name,
                    date: commit.date,
                    message: commit.message,
                    diff: diff
                });
            }

            return commits;
        } catch (error) {
            console.error('Error reading git history:', error);
            return [];
        }
    }

    async printCommitHistory(): Promise<void> {
        const commits = await this.getCommits();
        
        console.log(`Git History for ${this.repoPath} as of ${this.currentTime}:\n`);
        
        if (commits.length === 0) {
            console.log('No commits found or not a git repository.');
            return;
        }
        
        for (const commit of commits) { 
            console.log('----------------------------------------');
            console.log(`Commit: ${commit.hash}`);
            console.log(`Author: ${commit.author}`);
            console.log(`Date: ${commit.date}`);
            console.log(`Message: ${commit.message}`);
            console.log('\nDiff:\n');
            console.log(commit.diff);
            console.log('----------------------------------------\n');
        }
    }

    async applyToRepo(targetRepoPath: string, options: ApplyOptions = {}): Promise<void> {
        const commits = await this.getCommits();
        if (commits.length === 0) {
            console.log('No commits to apply.');
            return;
        }

        const targetGit = simpleGit(targetRepoPath);
        
        // Check if target is a git repository
        const isRepo = await targetGit.checkIsRepo();
        if (!isRepo) {
            console.log(`Target is not a git repository: ${targetRepoPath}`);
            return;
        }

        // Set up environment variables for committer if provided
        const env: { [key: string]: string } = {};
        if (options.newCommitter && options.newCommitterEmail) {
            env.GIT_COMMITTER_NAME = options.newCommitter;
            env.GIT_COMMITTER_EMAIL = options.newCommitterEmail;
        }

        console.log(`Applying commits to ${targetRepoPath}...\n`);

        for (const commit of commits) {
            try {
                // Create a patch file for this commit with full metadata
                const patchPath = `${this.repoPath}/temp_${commit.hash}.patch`;
                await this.git.raw(['format-patch', '--stdout', '-1', 
                    '--full-index', '--binary', '--date-order',
                    commit.hash, '-o', this.repoPath]);

                // Build the am command with author override if provided
                const amArgs = [
                    '--committer-date-is-author-date',  // Preserve the original commit date
                    '--ignore-space-change',            // Be a bit more lenient with whitespace
                    '--ignore-whitespace',              // Ignore whitespace changes
                    '--3way'                            // Try 3-way merge if needed
                ];

                // Add author information if provided
                if (options.newAuthor && options.newEmail) {
                    amArgs.push('--author', `${options.newAuthor} <${options.newEmail}>`);
                }

                amArgs.push(patchPath);

                // Apply the patch preserving the original commit date
                console.log(`Applying commit: ${commit.message} (${commit.date})`);
                await targetGit.raw(amArgs); //, { env });
                
                // Clean up the patch file
                await targetGit.raw(['clean', '-f', patchPath]);
                
                const authorInfo = options.newAuthor 
                    ? `new author: ${options.newAuthor}`
                    : `original author: ${commit.author}`;
                const committerInfo = options.newCommitter
                    ? `new committer: ${options.newCommitter}`
                    : 'original committer';
                console.log(`✓ Successfully applied with ${authorInfo}, ${committerInfo} and original date: ${commit.date}\n`);
            } catch (error) {
                console.error(`Failed to apply commit ${commit.hash} from ${commit.date}:`, error);
                // Abort the current patch application if it failed
                await targetGit.raw(['am', '--abort']);
            }
        }
    }
}

const program = new Command();

program
    .name('git-logger')
    .description('CLI tool to display git repository history with diffs')
    .version('1.0.0')
    .requiredOption('-p, --path <path>', 'Path to the git repository')
    .option('-t, --time <time>', 'Custom timestamp (ISO format)')
    .option('-a, --apply <targetPath>', 'Apply commits to target repository')
    .option('--author <name>', 'New author name for applied commits')
    .option('--email <email>', 'New author email for applied commits')
    .option('--committer <name>', 'New committer name for applied commits')
    .option('--committer-email <email>', 'New committer email for applied commits');

program.parse();

const options = program.opts();

// Create and use the GitLogger with command line arguments
const gitLogger = new GitLogger(options.path, options.time);

if (options.apply) {
    const applyOptions: ApplyOptions = {};
    if (options.author && options.email) {
        applyOptions.newAuthor = options.author;
        applyOptions.newEmail = options.email;
    }
    if (options.committer && options.committerEmail) {
        applyOptions.newCommitter = options.committer;
        applyOptions.newCommitterEmail = options.committerEmail;
    }
    
    gitLogger.applyToRepo(options.apply, applyOptions).catch(error => {
        console.error('Failed to apply commits:', error);
        process.exit(1);
    });
} else {
    gitLogger.printCommitHistory().catch(error => {
        console.error('Failed to print git history:', error);
        process.exit(1);
    });
}

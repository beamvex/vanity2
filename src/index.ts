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
}

const program = new Command();

program
    .name('git-logger')
    .description('CLI tool to display git repository history with diffs')
    .version('1.0.0')
    .requiredOption('-p, --path <path>', 'Path to the git repository')
    .option('-t, --time <time>', 'Custom timestamp (ISO format)');

program.parse();

const options = program.opts();

// Create and use the GitLogger with command line arguments
const gitLogger = new GitLogger(options.path, options.time);
gitLogger.printCommitHistory().catch(error => {
    console.error('Failed to print git history:', error);
    process.exit(1);
});

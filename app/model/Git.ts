// Author Supan Adit Pratama <supanadit@gmail.com>
import { archiveStore, gitRepoStore, gitStore } from '../../config/setting';
import { spawn, spawnSync } from "child_process";
import { Script } from "./Script";

const fs = require('fs');
const tomlify = require('tomlify-j0.4');
const ora = require('ora');

export interface GitModel {
    url: string;
}

export class Git implements GitModel {
    url: string;

    cloned: boolean = false;
    protected location: string = '';

    protected urlType: string; // SSH / HTTPS / HTTP ( Currently Only Support HTTP / HTTPS )
    protected projectName: string;

    protected invalidURL: boolean = true;

    constructor(git: GitModel) {
        this.url = git.url;
        this.urlType = '';
        this.projectName = '';

        const http = 'http';
        const https = 'https';
        const url = this.url;
        let isHTTPS = false;
        let isHTTP = false;
        let isSSH = false;
        // Verify If it HTTPS
        if (url.slice(0, https.length) == https) {
            isHTTPS = true;
            this.urlType = 'HTTPS';
        } else {
            // Verify If it HTTP
            if (url.slice(0, http.length) == http) {
                isHTTP = true;
                this.urlType = 'HTTP';
            } else {
                // If Not HTTPS / HTTP it could be SSH Maybe
                const splitToGetAtSymbol = url.split("@");
                if (splitToGetAtSymbol.length != 0) {
                    const userGitName = splitToGetAtSymbol[0]; // It should be git
                    const nameLeft = splitToGetAtSymbol[1]; // It should be eg. bitbucket.org:username/repository_name
                    const splitNameLeft = nameLeft.split(":");
                    if (splitNameLeft.length != 0) {
                        const domainName = splitNameLeft[0]; // It should be eg. bitbucket.org / github.com / gitlab.com
                        const usernameAndRepository = splitNameLeft[1]; // It should be eg. username/repository_name
                        const splitUsernameAndRepository = usernameAndRepository.split("/");
                        if (splitUsernameAndRepository.length != 0) {
                            const username = splitUsernameAndRepository[0];
                            const repository_name = splitUsernameAndRepository[1];
                            this.projectName = repository_name;
                            isSSH = true;
                        } else {
                            this.urlType = 'Unknown';
                        }
                    } else {
                        this.urlType = 'Unknown';
                    }
                } else {
                    this.urlType = 'Unknown';
                }
            }
        }

        // If it HTTP / HTTPS
        if (isHTTP || isHTTPS) {
            this.invalidURL = false;
            const splitURL: Array<string> = url.split('/').slice(2);
            this.projectName = splitURL[splitURL.length - 1].split('.')[0];
            this.location = gitRepoStore.concat('/').concat(this.projectName);
            if (this.isRepositotyExist()) {
                this.cloned = true;
            }
        } else if (isSSH) {
            this.invalidURL = false;
            this.location = gitRepoStore.concat('/').concat(this.projectName);
            if (this.isRepositotyExist()) {
                this.cloned = true;
            }
        }
    }

    getProjectName(): string {
        return this.projectName;
    }

    isInvalidURL(): boolean {
        return this.invalidURL;
    }

    getRepositorySaveLocation(): string {
        return this.location;
    }

    getConfigFileLocation(): string {
        return gitStore.concat('/').concat(this.getProjectName()).concat('.toml');
    }

    getArchiveLocation(): string {
        return archiveStore.concat('/').concat(this.getProjectName()).concat('.zip');
    }

    getArchiveNameOnly(): string {
        return this.getProjectName().concat('.zip');
    }

    clone() {
        if (!this.invalidURL) {
            const commandExecution = spawn('git', ['clone', this.url, this.getRepositorySaveLocation()], {
                shell: true,
            });
            const spinner = ora(`Please wait, Cloning ${this.url}\n`).start();
            commandExecution.on('close', (code: any) => {
                if (code == 0) {
                    spinner.succeed(`Success Cloning Repository ${this.url}`);
                    this.cloned = true;
                    this.createConfigFile();
                } else {
                    spinner.fail(`Failed to Cloning Repository ${this.url}`);
                }
            });
        }
    }

    compress(specificDirectory: Array<string> = []) {
        if (!this.invalidURL) {
            const compressDirectory = (specificDirectory.length == 0) ? this.getRepositorySaveLocation() : this.getRepositorySaveLocation().concat("/").concat(
                specificDirectory.join("/")
            );
            if (this.isExists()) {
                const commandExecution = spawn('zip', ['-r', this.getArchiveNameOnly(), "."], {
                    shell: true,
                    cwd: compressDirectory,
                });
                const spinner = ora(`Please wait, Compressing Repository ${this.url}\n`).start();
                commandExecution.on('close', (code: any) => {
                    if (code == 0) {
                        const currentArchive = compressDirectory.concat("/").concat(this.getArchiveNameOnly());
                        const moveExecution = spawn('mv', [currentArchive, this.getArchiveLocation()], {
                            shell: true,
                        });
                        moveExecution.on('close', (code: any) => {
                            if (code == 0) {
                                spinner.succeed(`Success Compressing Repository ${this.url}`);
                            } else {
                                spinner.fail(`Failed to Compressing Repository ${this.url}`);
                            }
                        });
                    } else {
                        spinner.fail(`Failed to Compressing Repository ${this.url}`);
                    }
                });
            }
        }
    }

    compressSync() {
        if (!this.invalidURL) {
            if (this.isExists()) {
                spawnSync('zip', ['-r', this.getArchiveLocation(), this.getRepositorySaveLocation()]);
            }
        }
    }

    getRepositoryUpdate() {
        if (!this.invalidURL) {
            if (this.isExists()) {
                const commandExecution = spawn('git', ['pull'], {
                    shell: true,
                    cwd: this.getRepositorySaveLocation(),
                });
                const spinner = ora(`Getting Update Repository${this.url}\n`).start();
                commandExecution.on('close', (code: any) => {
                    if (code == 0) {
                        spinner.succeed(`Repository ${this.url} have been updated`);
                    } else {
                        spinner.fail(`Failed to Get an Update Repository ${this.url}`);
                    }
                });
            }
        }
    }

    getRepositoryUpdateSync() {
        if (!this.invalidURL) {
            if (this.isExists()) {
                spawn('git', ['pull'], {
                    cwd: this.getRepositorySaveLocation(),
                });
            }
        }
    }

    isExists(): boolean {
        return fs.existsSync(this.getConfigFileLocation());
    }

    isArchiveExist(): boolean {
        return fs.existsSync(this.getArchiveLocation());
    }

    isRepositotyExist(): boolean {
        let result: boolean = false;
        if (this.getRepositorySaveLocation() != '') {
            result = fs.existsSync(this.getRepositorySaveLocation());
        }
        return result;
    }

    deleteConfigFile(): void {
        if (this.isExists()) {
            fs.unlinkSync(this.getConfigFileLocation());
        }
    }

    deleteRepository(): void {
        if (this.getRepositorySaveLocation()) {
            spawnSync('rm', ['-rf', this.getRepositorySaveLocation()], {
                shell: true,
            });
        }
    }

    deleteArchive(): void {
        if (this.isArchiveExist()) {
            fs.unlinkSync(this.getArchiveLocation());
        }
    }

    deleteAll(): void {
        const spinner = ora(`Pleasewait.. Removing ${this.url}\n`).start();
        this.deleteConfigFile();
        this.deleteRepository();
        this.deleteArchive();
        spinner.succeed(`Success Removing Git ${this.url}`);
    }

    createConfigFile(): boolean {
        let result: boolean = false;
        if (!this.invalidURL) {
            if (!this.isExists()) {
                try {
                    let git: Git = this;
                    const toml = tomlify.toToml(git, {space: 2});
                    fs.writeFileSync(this.getConfigFileLocation(), toml);
                } catch (error) {
                    console.log('Error While Create Config for Git Repository', this.url, 'With Error', error);
                }
            }
        }
        return result;
    }

    async runScript(script: Script) {
        await script.runScript(null, this.getRepositorySaveLocation());
    }
}

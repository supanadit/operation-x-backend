// Author Supan Adit Pratama <supanadit@gmail.com>
import { archiveStore, gitRepoStore, gitStore } from '../../config/setting';
import { spawn, spawnSync } from 'child_process';
import { Script } from './Script';
import { Log, LogProcess } from './Log';

const fs = require('fs');
const tomlify = require('tomlify-j0.4');
const ora = require('ora');
const recursive = require('recursive-readdir-synchronous');
const toml = require('toml');

export interface GitModel {
    url: string;
    originalURL?: string;
    username?: string;
    password?: string;
    cloned?: boolean;
    projectName?: string;
    urlType?: string;
}

export class Git implements GitModel {
    url: string;
    originalURL: string;
    username?: string;
    password?: string;

    cloned: boolean = false;
    projectName: string;
    urlType: string; // SSH / HTTPS / HTTP ( Currently Only Support HTTP / HTTPS )

    protected location: string = '';
    protected invalidURL: boolean = true;

    constructor(git: GitModel, isFromLocal: boolean = false) {
        this.url = git.url;
        this.originalURL = git.url;
        this.urlType = '';
        this.projectName = '';
        this.username = git.username;
        this.password = git.password;

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
                const splitToGetAtSymbol = url.split('@');
                if (splitToGetAtSymbol.length != 0) {
                    const userGitName = splitToGetAtSymbol[0]; // It should be git
                    const nameLeft = splitToGetAtSymbol[1]; // It should be eg. bitbucket.org:username/repository_name
                    const splitNameLeft = nameLeft.split(':');
                    if (splitNameLeft.length != 0) {
                        const domainName = splitNameLeft[0]; // It should be eg. bitbucket.org / github.com / gitlab.com
                        const usernameAndRepository = splitNameLeft[1]; // It should be eg. username/repository_name
                        const splitUsernameAndRepository = usernameAndRepository.split('/');
                        if (splitUsernameAndRepository.length != 0) {
                            const username = splitUsernameAndRepository[0];
                            const repository_name = splitUsernameAndRepository[1];
                            const repository_name_split = repository_name.split('.');
                            this.projectName = repository_name;
                            if (repository_name_split.length != 0) {
                                this.projectName = repository_name_split[0];
                            }
                            isSSH = true;
                            this.urlType = 'SSH';
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
            let currentURL = this.url;
            if (isHTTPS) {
                currentURL = this.url.slice(https.length);
            } else {
                currentURL = this.url.slice(http.length);
            }
            const symbolAfterProtocol = '://';
            currentURL = currentURL.slice(symbolAfterProtocol.length);
            let splitUsernameWithLink: Array<string> = [];
            if (currentURL.includes('@')) {
                splitUsernameWithLink = currentURL.split('@'); // Split example@example.com/etc.git
            } else {
                splitUsernameWithLink = [currentURL];
            }

            let username = '';
            let domainIndex = 0;
            if (splitUsernameWithLink.length > 1) {
                username = splitUsernameWithLink[0];
                domainIndex = 1;
                if (this.username == null) {
                    this.username = username;
                }
            }

            const splitDomainWithLink = splitUsernameWithLink[domainIndex].split('.');
            const hostName = splitDomainWithLink[0]; // Github / Bitbucket / Gitlab
            const splitTLDwithLink = splitDomainWithLink[1].split('/');
            const tldName = splitTLDwithLink[0]; // .com / .org / .net
            const path = splitTLDwithLink.slice(1).join('/');

            const splitURL: Array<string> = url.split('/').slice(2);
            this.projectName = splitURL[splitURL.length - 1].split('.')[0];
            this.location = gitRepoStore.concat('/').concat(this.projectName);
            let linkReplacement = ((this.username) ? this.username : '');
            linkReplacement = ((this.username) ? (
                (this.password) ? linkReplacement.concat(':').concat(this.password) : ''
            ) : '');
            const fullDomain = hostName.concat('.').concat(tldName);
            linkReplacement = (linkReplacement != '') ? linkReplacement.concat('@').concat(fullDomain) : fullDomain;
            const urlFirst = ((isHTTP) ? http : https).concat(symbolAfterProtocol);
            linkReplacement = urlFirst.concat(linkReplacement).concat('/').concat(path).concat('.git');
            if (username != '' && this.password != null) {
                this.url = linkReplacement;
            }
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

        if (isFromLocal) {
            try {
                let dataToml: string = fs.readFileSync(this.getConfigFileLocation(), 'utf-8');
                let gitModel: GitModel = toml.parse(dataToml);
                this.urlType = (gitModel.urlType) ? gitModel.urlType : '';
                this.projectName = (gitModel.projectName) ? gitModel.projectName : '';
                this.cloned = (gitModel.cloned) ? gitModel.cloned : false;
            } catch (error) {
                // If go to Catch probably because while fs.readFileSync() not found
                // console.log(this.getProjectName(), 'was not found');
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

    clone(operation: Log | null = null) {
        if (!this.invalidURL) {
            const commandExecution = spawn('git', ['clone', this.url, this.getRepositorySaveLocation()], {
                shell: true,
            });
            // commandExecution.stderr.pipe(process.stderr);
            // commandExecution.stdout.pipe(process.stdout);
            const spinner = ora(`Please wait, Cloning ${this.url}\n`).start();
            let operationStart: LogProcess | null = null;
            if (operation != null) {
                operationStart = operation.addOperationLog('Cloning Repository', 'Start Cloning Repository');
            }
            // if (this.password != null) {
            //     for (let x of this.password.split('').concat('\n')) {
            //         commandExecution.stdin.write(x);
            //     }
            // }
            // commandExecution.stdout.setEncoding('utf8');
            // commandExecution.stdout.on('data', function (data) {
            //     console.log('stdout: ' + data);
            // });
            //
            // commandExecution.stderr.setEncoding('utf8');
            // commandExecution.stderr.on('data', function (data) {
            //     console.log('stderr: ' + data);
            // });
            commandExecution.on('close', (code: any) => {
                if (operation != null && operationStart != null) {
                    operation.setOperationLogFinish(operationStart);
                }
                if (code == 0) {
                    if (operation != null) {
                        operation.setOperationLogFinish(operation.addOperationLog('Cloning Repository', `Success Cloning Repository ${this.url}`));
                    }
                    spinner.succeed(`Success Cloning Repository ${this.url}`);
                    this.cloned = true;
                    this.createConfigFile();
                } else {
                    if (operation != null) {
                        operation.setOperationLogFinish(operation.addOperationLog('Cloning Repository', `Failed to Cloning Repository ${this.url}`));
                    }
                    spinner.fail(`Failed to Cloning Repository ${this.url}`);
                }
                if (operation != null) {
                    operation.stop();
                }
            });
        }
    }

    compress(specificDirectory: Array<string> = [], operation: Log | null = null) {
        if (!this.invalidURL) {
            const compressDirectory = (specificDirectory.length == 0) ? this.getRepositorySaveLocation() : this.getRepositorySaveLocation().concat('/').concat(
                specificDirectory.join('/')
            );
            if (this.isExists()) {
                const commandExecution = spawn('zip', ['-r', this.getArchiveNameOnly(), '.'], {
                    shell: true,
                    cwd: compressDirectory,
                });
                const spinner = ora(`Please wait, Compressing Repository ${this.url}\n`).start();
                if (operation != null) {
                    operation.setOperationLogFinish(operation.addOperationLog('Compressing', `Start Compressing`));
                }
                commandExecution.on('close', (code: any) => {
                    if (code == 0) {
                        const currentArchive = compressDirectory.concat('/').concat(this.getArchiveNameOnly());
                        const moveExecution = spawn('mv', [currentArchive, this.getArchiveLocation()], {
                            shell: true,
                        });
                        moveExecution.on('close', (code: any) => {
                            if (code == 0) {
                                if (operation != null) {
                                    operation.setOperationLogFinish(operation.addOperationLog('Success', `Success Compressing Repository`));
                                }
                                spinner.succeed(`Success Compressing Repository ${this.url}`);
                            } else {
                                if (operation != null) {
                                    operation.setOperationLogFinish(operation.addOperationLog('Failed', `Failed Compressing Repository`));
                                }
                                spinner.fail(`Failed to Compressing Repository ${this.url}`);
                            }
                        });
                    } else {
                        if (operation != null) {
                            operation.setOperationLogFinish(operation.addOperationLog('Failed', `Failed Compressing Repository`));
                        }
                        spinner.fail(`Failed to Compressing Repository ${this.url}`);
                    }
                    if (operation != null) {
                        operation.stop();
                    }
                });
            }
        }
    }

    compressSync(specificDirectory: Array<string> = []) {
        if (!this.invalidURL) {
            if (this.isExists()) {
                const compressDirectory = (specificDirectory.length == 0) ? this.getRepositorySaveLocation() : this.getRepositorySaveLocation().concat('/').concat(
                    specificDirectory.join('/')
                );
                const command = spawnSync('zip', ['-r', this.getArchiveNameOnly(), '.'], {
                    cwd: compressDirectory,
                    encoding: 'utf-8'
                });
                const currentArchive = compressDirectory.concat('/').concat(this.getArchiveNameOnly());
                const moveExecution = spawnSync('mv', [currentArchive, this.getArchiveLocation()], {
                    shell: true,
                });
            }
        }
    }

    getListDirectory(directory: string = '/'): string[] | null {
        let result = null;
        if (!this.invalidURL) {
            if (this.isExists()) {
                const pathToFind = this.getRepositorySaveLocation().concat(directory);
                const command = spawnSync('ls', [pathToFind], {
                    encoding: 'utf-8',
                });
                if (command.status == 0) {
                    result = [];
                    const directoryListing = command.stdout.split('\n');
                    for (let x of directoryListing) {
                        try {
                            const check = fs.lstatSync(pathToFind.concat(x));
                            if (check.isDirectory()) {
                                result.push(directory.concat(x));
                            }
                        } catch (er) {
                            // console.log(er);
                        }
                    }
                }
            }
        }
        return result;
    }

    getRepositoryUpdate(operation: Log | null = null) {
        if (!this.invalidURL) {
            if (this.isExists()) {
                const commandExecution = spawn('git', ['pull'], {
                    shell: true,
                    cwd: this.getRepositorySaveLocation(),
                });
                const spinner = ora(`Getting Update Repository${this.url}\n`).start();
                if (operation != null) {
                    operation.setOperationLogFinish(operation.addOperationLog('Updating Repository', `Getting Update Repository`));
                }
                commandExecution.on('close', (code: any) => {
                    if (code == 0) {
                        spinner.succeed(`Repository ${this.url} have been updated`);
                        if (operation != null) {
                            operation.setOperationLogFinish(operation.addOperationLog('Success', `Success get update Repository`));
                        }
                    } else {
                        spinner.fail(`Failed to Get an Update Repository ${this.url}`);
                        if (operation != null) {
                            operation.setOperationLogFinish(operation.addOperationLog('Failed', `Failed get update Repository`));
                        }
                    }
                    if (operation != null) {
                        operation.stop();
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

    deleteConfigFile(operation: Log | null = null): void {
        if (this.isExists()) {
            fs.unlinkSync(this.getConfigFileLocation());
            if (operation != null) {
                operation.addNoProcessOperationLog('Config', 'Removing Config File');
            }
        } else {
            if (operation != null) {
                operation.addNoProcessOperationLog('Config', 'Config file not exist');
            }
        }
    }

    deleteRepository(operation: Log | null = null): void {
        if (this.getRepositorySaveLocation()) {
            spawnSync('rm', ['-rf', this.getRepositorySaveLocation()], {
                shell: true,
            });
            if (operation != null) {
                operation.addNoProcessOperationLog('Repository', 'Success remove repository');
            }
        } else {
            if (operation != null) {
                operation.addNoProcessOperationLog('Repository', 'Repository not exist');
            }
        }
    }

    deleteArchive(operation: Log | null = null): void {
        if (this.isArchiveExist()) {
            fs.unlinkSync(this.getArchiveLocation());
            if (operation != null) {
                operation.addNoProcessOperationLog('Archive', 'Success remove archive');
            }
        } else {
            if (operation != null) {
                operation.addNoProcessOperationLog('Archive', 'Archive not Found');
            }
        }
    }

    deleteAll(operation: Log | null = null): void {
        const spinner = ora(`Pleasewait.. Removing ${this.url}\n`).start();
        if (operation != null) {
            operation.addNoProcessOperationLog('Preparing', 'Prepare to Remove Repository');
        }
        this.deleteConfigFile(operation);
        this.deleteRepository(operation);
        this.deleteArchive(operation);
        if (operation != null) {
            operation.addNoProcessOperationLog('Finish', 'Finish');
            operation.stop();
        }
        spinner.succeed(`Success Removing Git ${this.url}`);
    }

    createConfigFile(): boolean {
        let result: boolean = false;
        if (!this.invalidURL) {
            try {
                let git: Git = this;
                const toml = tomlify.toToml(git, {space: 2});
                fs.writeFileSync(this.getConfigFileLocation(), toml);
            } catch (error) {
                console.log('Error While Create Config for Git Repository', this.url, 'With Error', error);
            }
        }
        return result;
    }

    async runScript(script: Script) {
        await script.runScript(null, this.getRepositorySaveLocation());
    }

    static getAll(): Git[] {
        const files = recursive(gitStore, ['.gitkeep',]);
        return files.map((x: any) => {
            let dataToml: string = fs.readFileSync(x, 'utf-8');
            let gitModel: GitModel = toml.parse(dataToml);
            return new Git(gitModel, true);
        });
    }
}

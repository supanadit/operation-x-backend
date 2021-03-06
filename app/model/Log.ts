import { logStore } from '../../config/setting';
import { Socket } from '../helper/Socket';

export const fs = require('fs');
export const moment = require('moment');
export const tomlify = require('tomlify-j0.4');
export const dateTimeFormatOperation: string = 'YYYY-MM-DD HH:mm:ss';
const recursive = require('recursive-readdir-synchronous');
const toml = require('toml');
let operationCodeGlobal = 0;
let operationIncrementalProcess = 0;

export interface LogInterface {
    operationCode: number; // It will be generated by System
    operation: string; // It Should String eg. Git, Repository
    running: boolean; // Indicating Process is running
    message: string;
    log: LogProcessInterface[];

    startTime?: string;
    stopTime?: string;
    notFinishOperation?: number;
    finishOperation?: number;
    totalOperation?: number;
}

export interface LogProcessInterface {
    name: string;
    description: string;
    status: 'error' | 'normal' | 'warning' | 'danger';
    finish: boolean;
}

export class LogProcess implements LogProcessInterface {
    startTime: string;
    stopTime: string = '';
    description: string;
    name: string;
    status: 'error' | 'normal' | 'warning' | 'danger';
    finish: boolean = false;

    constructor(name: string, description: string, status: 'error' | 'normal' | 'warning' | 'danger') {
        this.startTime = moment().format(dateTimeFormatOperation);
        this.description = description;
        this.name = name;
        this.status = status;
    }

    stop() {
        this.stopTime = moment().format(dateTimeFormatOperation);
        this.finish = true;
    }
}

export class Log implements LogInterface {
    log: LogProcessInterface[] = [];
    message: string = '';
    operation: string = '';
    operationCode: number = 0;
    running: boolean = true;
    startTime: string = '';
    stopTime: string = '';
    notFinishOperation: number = 0;
    finishOperation: number = 0;
    totalOperation: number = 0;
    socketIO: Socket | null = null;
    indexAtList: number | null = null;

    constructor(operation: string, message: string, socket: Socket | null = null) {
        operationCodeGlobal = operationCodeGlobal + 1;
        this.operation = operation;
        this.operationCode = operationCodeGlobal;
        this.message = message;
        this.startTime = moment().format(dateTimeFormatOperation);
        operationIncrementalProcess += 1;
        this.socketIO = socket;
        if (this.socketIO != null) {
            this.socketIO.listOperationMemory.push(this);
            this.indexAtList = this.socketIO.listOperationMemory.indexOf(this);
            this.socketIO.reloadListOperationMemory();
        }
    }

    stop() {
        this.stopTime = moment().format(dateTimeFormatOperation);
        for (let x of this.log) {
            if (x.finish) {
                this.notFinishOperation = this.notFinishOperation - 1;
                this.finishOperation = this.finishOperation + 1;
            }
        }
        this.running = false;
        const toml = tomlify.toToml(this.get(), {space: 2});
        const nameLog = this.operation.split(' ').map((x: string) => {
            return x.toLowerCase();
        }).join('-');
        const fileName = operationIncrementalProcess.toString().concat('-').concat(this.operationCode.toString()).concat('-').concat(nameLog);
        const dateTime = moment().format('YYYYMMDDHHmmss');
        const location = logStore.concat('/').concat(dateTime).concat('-').concat(fileName).concat('.toml');
        operationCodeGlobal = operationCodeGlobal - 1;
        fs.writeFileSync(location, toml);
        this.reloadSocket();
    }

    reloadSocket(): void {
        if (this.socketIO != null && this.indexAtList != null) {
            this.socketIO.updateOperationMemory(this, this.indexAtList);
        }
    }

    get(): any {
        let operationSave = {};
        for (let [key, value] of Object.entries(this)) {
            if (key != 'socketIO' && key != 'indexAtList') {
                Object.assign(operationSave, {
                    [key]: value,
                });
            }
        }
        return operationSave;
    }

    addOperationLog(name: string, description: string, status: 'error' | 'normal' | 'warning' | 'danger' = 'normal'): LogProcess {
        const operationLog: LogProcess = new LogProcess(name, description, status);
        this.log.push(operationLog);
        this.totalOperation = this.log.length;
        this.notFinishOperation = this.log.length;
        this.reloadSocket();
        return operationLog;
    }

    addNoProcessOperationLog(name: string, description: string, status: 'error' | 'normal' | 'warning' | 'danger' = 'normal') {
        const operationLog: LogProcess = new LogProcess(name, description, status);
        operationLog.stop();
        this.log.push(operationLog);
        this.totalOperation = this.log.length;
        this.reloadSocket();
    }

    setOperationLogFinish(operationLog: LogProcess) {
        operationLog.stop();
        const index: number = this.log.indexOf(operationLog);
        if (typeof index != 'undefined') {
            this.log[index] = operationLog;
        }
        this.reloadSocket();
    }

    isNotFinish() {
        return !this.running;
    }

    static getListAllOperation(): Log[] {
        const files = recursive(logStore, ['.gitkeep',]);
        return files.map((x: any) => {
            let dataToml: string = fs.readFileSync(x, 'utf-8');
            let operationData: LogInterface = toml.parse(dataToml);
            let operationClass: Log = new Log(operationData.operation, operationData.message);
            operationClass.log = operationData.log;
            if (operationData.finishOperation) {
                operationClass.finishOperation = operationData.finishOperation;
            }
            if (operationData.notFinishOperation) {
                operationClass.notFinishOperation = operationData.notFinishOperation;
            }
            if (operationData.running) {
                operationClass.running = operationData.running;
            }
            if (operationData.startTime) {
                operationClass.startTime = operationData.startTime;
            }
            if (operationData.stopTime) {
                operationClass.stopTime = operationData.stopTime;
            }
            if (operationData.totalOperation) {
                operationClass.totalOperation = operationData.totalOperation;
            }
            if (operationData.operationCode) {
                operationClass.operationCode = operationData.operationCode;
            }
            return operationClass;
        });
    }
}

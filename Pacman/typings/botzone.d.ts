interface ResultLogBase {
	verdict: string;
	time?: number;
	memory?: number;
}

interface JudgeResultLog extends ResultLogBase {
	output: {
		display: any;
		content: {
			[index: string]: any;
		}
		command: string;
	}
}

interface BrowserResultLog extends ResultLogBase {
	response: any;
	content: any;
}

interface BotResultLog extends ResultLogBase {
	response: any;
	debug?: any;
}

interface JQueryStatic {
	cookie(key: string, value?: string, options?: Object): string;
}

interface JQuery {
	shatter(): JQuery;
	expand(): JQuery;
	shrink(): JQuery;
	addNumberHandle(): JQuery;
}

declare type FullLogItem = JudgeResultLog | {
	[index: string]: BrowserResultLog | BotResultLog
};

declare type FullLog = FullLogItem[];

/**
 * Botzone 2.0 游戏播放器接口声明
 */
declare var infoProvider: {
	// 获得对局初始化数据
	getMatchInitData(): string,
	// 获得所有log
	getLogList(): FullLog,
	// 获得所有玩家名字数组
	getPlayerNames(): { name: string }[],
	// 获得是否是实时对局
	isLive(): boolean,
	// 获得当前玩家位置序号（-1表示回放/观战）
	getPlayerID(): number,
	// 传入回调函数原型：void fn(currentLog)（通常用于实时播放信息）
	setNewLogCallback(cb: (display: any) => void): void,
	// 传入回调函数原型：void fn(currentLog)（提醒玩家当前是玩家回合）
	setNewRequestCallback(cb: (request: any) => void): void,
	// 传入回调函数原型：void fn(scores)（通常用于实时播放刚刚结束）
	setGameOverCallback(cb: (scores: number[]) => void): void,
	// 传入回调函数原型：void fn(historyLogs), 参数是数组，功能：一次跳到log末尾状态（通常用于后来的观看者）
	setReadHistoryCallback(cb: (historyDisplays: any[]) => void): void,
	// 传入回调函数原型：void fn(currentLog), 参数是完整版单条log（通常只出现于回放）
	setReadFullLogCallback(cb: (log: FullLogItem) => void): void,
	setPauseCallback(cb: () => void): void,
	setPlayCallback(cb: () => void): void,
	setSize(width: number, height: number): void,
	// 内部初始化结束后调用
	notifyInitComplete(): void,
	// （可选）调用后可以隐藏载入遮罩
	notifyFinishedLoading(): void,
	// 玩家下了一步
	notifyPlayerMove(move: any): void,
	// 播放器想要暂停（不一定有效）
	notifyRequestPause(): void,
	// 播放器想要继续（不一定有效）
	notifyRequestResume(): void,
};
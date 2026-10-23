type Key = {key?:string;shiftKey?:boolean;repeat?:boolean;isComposing?:boolean;keyCode?:number};
export function createChatInputGuard(now?:()=>number): {start():void;end():void;blocked(event?:Key):boolean;shouldSend(event:Key):boolean};

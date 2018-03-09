import * as WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080/server');
let open = false;

ws.on('open', () => {
    console.log("server connected");
    open = true;
});

ws.on('close', () => {
    open = false;
})

export const wstelemetry = async (context, action) => {
    if (open)
        // console.log(action);
        ws.send(JSON.stringify(action));
}
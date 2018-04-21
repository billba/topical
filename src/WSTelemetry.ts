import * as WebSocket from 'ws';
import { TelemetryAction } from './Telemetry';

export class WSTelemetry {
    private open: boolean;
    private ws: WebSocket;

    constructor (url: string) {
        this.ws = new WebSocket(url);
        this.open = false;

        this.ws.on('open', () => {
            console.log("server connected");
            this.open = true;
        });

        this.ws.on('close', () => {
            this.open = false;
        })
    }

    async send (
        action: TelemetryAction
    ) {
        if (this.open)
            this.ws.send(JSON.stringify(action));
    }
}

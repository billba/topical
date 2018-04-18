import { Topic } from "./topical";
import { TurnContext } from "botbuilder";

export interface WaterfallState {
    index: number;
}

interface Step {
    (next: () => void): Promise<void>;
}

export class Waterfall <
    Begin = any,
    State extends WaterfallState = WaterfallState,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext
> extends Topic <Begin, State, Return, Constructor, Context> {

    async waterfall(... steps: Step[]) {
        if (this.state.index === undefined) {
            this.state.index = 0;
        }

        let next = true;

        while (next && this.state.index < steps.length) {
            next = false;

            await steps[this.state.index](() => {
                next = true;
            });

            this.state.index++;
        } 

        return this.state.index >= steps.length;    
    }
}


import { Topic } from "./topical";
import { TurnContext } from "botbuilder";

export interface WaterfallState {
    index: number;
}

export type Step = () => Promise<true | any>;

export class Waterfall <
    Begin = any,
    State extends WaterfallState = WaterfallState,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext
> extends Topic <Begin, State, Return, Constructor, Context> {

    async waterfall(... steps: Step[]) {

        if (this.state.index === undefined)
            this.state.index = 0;

        let next = true;

        while (next && this.state.index < steps.length) {
            next = await steps[this.state.index]() === true;

            this.state.index++;
        }

        return this.state.index >= steps.length;    
    }
}


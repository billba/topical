import { TurnContext } from "botbuilder";
import { Topic } from "./topical";

export interface WaterfallState {
    stepIndex: number;
}

export type Step = () => Promise<true | any>;

export const waterfall = async <
    S extends WaterfallState,
> (
    state: S,
    ... steps: Step[]
) => {

    if (state.stepIndex === undefined)
        state.stepIndex = 0;

    let next = true;

    while (next && state.stepIndex < steps.length) {
        next = await steps[state.stepIndex]() === true;

        state.stepIndex++;
    }

    return state.stepIndex >= steps.length;    
}

export class Waterfall <
    Begin = any,
    State extends WaterfallState = WaterfallState,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext
> extends Topic <Begin, State, Return, Constructor, Context> {

    waterfall (
        ... steps: Step[]
    ) {
        return waterfall(this.state, ... steps);
    }
}
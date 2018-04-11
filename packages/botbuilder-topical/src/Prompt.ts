import { Promiseable, Activity, BotContext } from 'botbuilder';
import { Topic } from "./topical";
import { toPromise, returnsPromiseVoid, Validator, ValidatorResult } from 'botbuilder-topical-common';

export interface PromptInit <S> {
    name: string;
    args: S;
}

export interface PromptState <S> {
    name: string;
    turns: number;
    args: S;
}

export interface PromptReturn <V> {
    name: string;
    result: ValidatorResult<V>;
}

export abstract class Prompt <
    V = any,
    S = any,
    Construct = any,
    Context extends BotContext = BotContext,
> extends Topic<PromptInit<S>, PromptState<S>, PromptReturn<V>, Construct, Context> {
    async init (
        args: PromptInit<S>,
    ) {
         this.state = {
            name: args.name,
            turns: 0,
            args: args.args,
        }

        await this.prompter();
    }

    async onTurn () {
        const result = await this.validator.validate(this.context.request);

        if (!result.reason)
            return this.returnToParent({
                name: this.state.name,
                result
            });

        if (++ this.state.turns === this.maxTurns) {
            return this.returnToParent({
                name: this.state.name,
                result: {
                    value: result.value,
                    reason: 'too_many_attempts',
                }
            });
        }

        return this.prompter(result);
    }

    maxTurns = 2;
 
    abstract async prompter (result?: ValidatorResult<V>): Promise<void>;

    abstract validator: Validator<V>;
}

import { Promiseable, Activity } from 'botbuilder';
import { TopicClass, TopicContext, TopicInstance, TopicContextData, toPromise, returnsPromiseVoid } from "./topical";
import { Validator, ValidatorResult } from './Validator';

interface PromptTopicClassInitArgs <S> {
    name: string;
    promptState: S;
}

interface PromptTopicClassState <S> {
    name: string;
    turns: number;
    promptState: S;
}

interface PromptTopicClassReturnArgs <V> {
    name: string;
    result: ValidatorResult<V>;
}

export class PromptTopicClass <V, S = any> extends TopicClass<PromptTopicClassInitArgs<S>, PromptTopicClassState<S>, PromptTopicClassReturnArgs <V>> {
    constructor (
        name: string
    ) {
        super(name);

        this
            .init(async (context, topicContext) => {
                topicContext.instance.state = {
                    name: topicContext.args.name,
                    turns: 0,
                    promptState: topicContext.args.promptState
                }
                await this._prompt(context, topicContext);
            })
            .onReceive (async (context, topicContext) => {
                const result = await this._validator.validate(context.request as Activity);
        
                if (!result.reason)
                    return await topicContext.returnToParent({
                        name: topicContext.instance.state.name,
                        result
                    });

                if (++ topicContext.instance.state.turns === this._maxTurns) {
                    return topicContext.returnToParent({
                        name: topicContext.instance.state.name,
                        result: {
                            value: result.value,
                            reason: 'too_many_attempts',
                        }
                    });
                }

                return this._prompt(context, topicContext);
            });
    }

    protected _maxTurns: number = 2;

    public maxTurns(maxTurns: number) {
        this._maxTurns = maxTurns;

        return this;
    }

    protected _prompt?: (context: BotContext, topicContext: TopicContext<PromptTopicClassState<S>, PromptTopicClassReturnArgs <V>>) => Promise<void>;
    
    public prompt(prompt: (context: BotContext, topicContext: TopicContext<PromptTopicClassState<S>, PromptTopicClassReturnArgs <V>>) => Promiseable<void>) {
        this._prompt = (context, topicContext) => toPromise(prompt(context, topicContext));

        return this;
    }

    protected _validator: Validator<V>;

    public validator(validator: Validator<V>) {
        this._validator = validator;
        return this;
    }
}

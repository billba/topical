import { Promiseable, MiddlewareHandler, ConsoleAdapter, TurnContext, Activity } from "botbuilder";
import { Topicable } from "./topical";

export const toPromise = <T> (t: Promiseable<T>) => (t as any).then ? (t as Promise<T>) : Promise.resolve<T>(t);

export const prettyConsole: MiddlewareHandler = (context, next) => {
    context.onSendActivities((_, activities, next) => {
        let first;

        for (let activity of activities) {
            if (activity.type === 'message') {
                activity.text = '> '
                    + activity.text!
                        .split('\n')
                        .join(`\n> `)
                    + '\n';

                if (!first) {
                    activity.text = '\n' + activity.text;
                    first = activity;
                }
            }
        }

        return next();
    });

    return next();
}

export const returnsPromiseVoid = () => Promise.resolve();

export const consoleOnTurn = (
    adapter: ConsoleAdapter,
    handler: (context: TurnContext) => Promise<void>
 ) => {
    const conversationUpdate: Partial<Activity> = {
        type: 'conversationUpdate',
        channelId: 'console',
        from: { id: 'user', name: 'User1' },
        conversation:  { id: 'convo1', name:'', isGroup: false },
        serviceUrl: '',
        membersAdded: [{
            id: 'user',
            name: 'user',
        }],
        recipient: {
            id: 'bot',
            name: 'bot',
        },
    };

    const context = new TurnContext(adapter, conversationUpdate);

    handler(context)
        .then(() => {
            adapter.listen(handler);
        });
}

export const doTopic = async <
    T extends Topicable<Begin, any, any, Constructor, Context>,
    Begin,
    Constructor,
    Context extends TurnContext = TurnContext
> (
    topic: T,
    context: Context,
    beginArgs?: Begin,
    constructorArgs?: Constructor,
) => {
    if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded!) {
            if (member.id != context.activity.recipient.id) {
                await (topic as any).begin(context, beginArgs, constructorArgs);
            }
        }
    } else {
        await (topic as any).onTurn(context);
    }
}
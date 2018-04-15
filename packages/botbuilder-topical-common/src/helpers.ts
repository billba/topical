import { Promiseable, MiddlewareHandler } from "botbuilder";

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

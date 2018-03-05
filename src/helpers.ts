import { TopicOnChildReturnContext, TopicOnChildReturn } from "./topical";
import { Promiseable, isPromised } from "botbuilder";

export const toPromise = <T> (t: Promiseable<T>) => isPromised(t) ? t : Promise.resolve(t);

export const prettyConsole = {
    postActivity(c, activities, next) {
        let first;

        for (let activity of activities) {
            if (activity.type === 'message') {
                activity.text = '> '
                    + activity.text
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
    }
}

export const returnsPromiseVoid = () => Promise.resolve();

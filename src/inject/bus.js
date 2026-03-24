import {EVENT_SOURCE} from "../shared/event-types";


export function post(type, payload) {
    window.postMessage(
        {
            source: EVENT_SOURCE,
            type,
            payload,
        },
        "*"
    );
}
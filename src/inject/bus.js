import {EVENT_SOURCE} from "../shared/event-types.js";


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
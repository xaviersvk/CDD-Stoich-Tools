export function emptyConstraints () {
        return {
            minimum_fit_type: null,
            minimum_lower_value: null,
            minimum_upper_value: null,
            maximum_fit_type: null,
            maximum_lower_value: null,
            maximum_upper_value: null,
            slope_fit_type: null,
            slope_lower_value: null,
            slope_upper_value: null
        };
    }

export function buildReadoutsOutlierState (allDataPoints = [], forcedValue = null) {
        const state = {};

        for (const point of allDataPoints) {
            if (!point?.readout_id) continue;

            if (forcedValue !== null) {
                state[String(point.readout_id)] = forcedValue;
            } else {
                state[String(point.readout_id)] = point?.outlier ? "1" : "0";
            }
        }

        return state;
    }



export function buildBaseSearchPayload  (editResponse, doseResponsePlot) {
        return {
            batch_run_aggregate_row_ids:
                editResponse?.specific_batch_run_aggregate_row_ids || [],
            run_ids_in_search: editResponse?.run_ids_in_search || [],
            condition_set_ids_in_search:
                editResponse?.condition_set_ids_in_search || [],
            dose_response_plot: doseResponsePlot
        };
    }

export function buildInterceptOverridePayload  (editResponse, interceptValue) {
        const serieses = editResponse?.data_serieses || [];
        const firstSeries = serieses[0];

        if (!firstSeries) {
            throw new Error("No data_serieses found in edit response.");
        }

        const firstInterceptDefinitionId =
            firstSeries?.intercept_readout_definitions?.[0]?.id;

        if (!firstInterceptDefinitionId) {
            throw new Error("No intercept_readout_definitions found.");
        }

        const doseResponsePlot = {};

        for (const series of serieses) {
            const seriesId = String(series.id);

            doseResponsePlot[seriesId] = {
                intercept_overrides: {
                    [String(firstInterceptDefinitionId)]: interceptValue
                },
                constraints: emptyConstraints(),
                readouts_outlier_state: buildReadoutsOutlierState(
                    series.all_data_points || [],
                    "0"
                ),
                curve_comment_ids: []
            };
        }

        return buildBaseSearchPayload(editResponse, doseResponsePlot);
    }

export function buildIc50GreaterThanMaxPayload (editResponse) {
        return buildInterceptOverridePayload(editResponse, 1);
    }

export function buildDoNotCalculatePayload (editResponse) {
        return buildInterceptOverridePayload(editResponse, 0);
    }

export function buildDoNotOverwritePayload  (editResponse) {
        return buildInterceptOverridePayload(editResponse, null);
    }

export function buildIc50LessThanMinPayload  (editResponse) {
        return buildInterceptOverridePayload(editResponse, 2);
    }



import { decodeHtmlEntities } from "../../utils/dom.js";

export function extractViewSettings(plotRoot) {
    const raw = plotRoot?.getAttribute("react_props");
    if (!raw) {
        return {
            batch_run_aggregate_row_ids: null,
            edit_mode: false,
            response_axis_min: -20,
            response_axis_max: 120,
            scale_by_global_min_max: false,
            scale_by_protocol_settings: true,
            scale_to_show_all_data: false
        };
    }

    const decoded = decodeHtmlEntities(raw);

    function pick(name, fallback = null) {
        const match = decoded.match(new RegExp(`"${name}":(".*?"|true|false|-?\\d+(?:\\.\\d+)?)`));
        if (!match) return fallback;

        const value = match[1];
        if (value === "true") return true;
        if (value === "false") return false;
        if (value.startsWith('"')) return value.slice(1, -1);
        return Number(value);
    }

    return {
        batch_run_aggregate_row_ids: pick("batch_run_aggregate_row_ids", null),
        edit_mode: pick("edit_mode", false),
        response_axis_min: pick("response_axis_min", -20),
        response_axis_max: pick("response_axis_max", 120),
        scale_by_global_min_max: pick("scale_by_global_min_max", false),
        scale_by_protocol_settings: pick("scale_by_protocol_settings", true),
        scale_to_show_all_data: pick("scale_to_show_all_data", false)
    };
}

export function buildViewRefreshPayload(editResponse, plotRoot) {
    const settings = extractViewSettings(plotRoot);

    return {
        batch_run_aggregate_row_ids: settings.batch_run_aggregate_row_ids,
        run_ids_in_search: editResponse?.run_ids_in_search || [],
        condition_set_ids_in_search: editResponse?.condition_set_ids_in_search || [],
        scale_by_protocol_settings: settings.scale_by_protocol_settings,
        scale_to_show_all_data: settings.scale_to_show_all_data,
        scale_by_global_min_max: settings.scale_by_global_min_max,
        response_axis_min: settings.response_axis_min,
        response_axis_max: settings.response_axis_max,
        edit_mode: settings.edit_mode
    };
}
// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// Power, mode, setpoint and fan are already Gladys scene actions on the
// device features, one feature per action: four Comfort Cloud calls, each
// several seconds long, the unit running the intermediate states.
// `apply_preset` sends them in one control request, the unit switching on at
// once with the right settings.
//
// The trigger (src/hub.js) is fired by the sign-in, never as a consequence of
// this action: a scene bound to it cannot loop.
// -----------------------------------------------------------------------------

const given = (value) => value !== undefined && value !== null && String(value).trim() !== '';

export const SCENE_ACTIONS = {
  async apply_preset(hub, { fields }) {
    const settings = { power: 1 };
    if (given(fields.mode)) {
      settings.mode = Number(fields.mode);
    }
    if (given(fields.target_temperature)) {
      const value = Number(String(fields.target_temperature).trim().replace(',', '.'));
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid setpoint "${fields.target_temperature}"`);
      }
      settings.targetTemperature = value;
    }
    if (given(fields.fan_speed)) {
      settings.fanSpeed = Number(fields.fan_speed);
    }
    if (given(fields.special_mode)) {
      settings.special = String(fields.special_mode);
    }
    const record = await hub.applySettings(fields.device, settings);
    return { target_temperature: hub.shownState(record)?.targetTemperature ?? null };
  },
};

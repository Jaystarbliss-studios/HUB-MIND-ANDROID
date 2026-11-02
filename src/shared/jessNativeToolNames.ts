/**
 * Canonical names for Jess tools that require the installed Windows desktop runtime.
 *
 * This is an availability hint only. Native authorization remains enforced by Electron
 * main-process IPC and the active Full Control session.
 */
export const JESS_NATIVE_TOOL_NAMES = [
  'jess_full_control',
  'jess_stop',
  'show_hub_mind_workspace',
  'list_windows',
  'manage_windows',
  'control_mouse',
  'start_windows_auto_scroll',
  'stop_windows_auto_scroll',
  'show_windows_ui_numbers',
  'hide_windows_ui_numbers',
  'drag_windows_mouse',
  'type_windows_text',
  'press_windows_keys',
  'control_system_volume',
  'control_screen_brightness',
  'take_windows_screenshot',
  'find_windows_ui_element',
  'list_windows_ui_elements',
  'invoke_windows_ui_element',
  'set_windows_ui_value',
  'read_windows_screen',
  'open_local_windows_path',
  'launch_windows_application',
  'run_windows_command_native',
  'scan_windows_storage',
  'clean_windows_storage_candidates',
  'manage_windows_files',
  'manage_windows_clipboard',
  'control_windows_power',
  'get_windows_time',
  'get_windows_system_info',
  'chrome_bridge_status',
  'chrome_list_tabs',
  'chrome_open_tab',
  'chrome_close_tab',
  'chrome_activate_tab',
  'chrome_navigate_tab',
  'chrome_reload_tab',
  'chrome_read_page',
  'chrome_find_element',
  'chrome_click_element',
  'chrome_fill_field',
  'chrome_scroll',
  'chrome_capture_screenshot'
] as const;

export const JESS_NATIVE_TOOL_NAME_SET: ReadonlySet<string> = new Set(JESS_NATIVE_TOOL_NAMES);

export function getJessToolsForRuntime(groups: any[], isDesktopRuntime: boolean): any[] {
  return groups.map((group) => {
    if (!Array.isArray(group?.functionDeclarations)) return group;
    return {
      ...group,
      functionDeclarations: group.functionDeclarations.filter(
        (declaration: any) => isDesktopRuntime || !JESS_NATIVE_TOOL_NAME_SET.has(declaration?.name),
      ),
    };
  });
}

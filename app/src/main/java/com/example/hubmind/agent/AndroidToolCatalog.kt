package com.example.hubmind.agent

import org.json.JSONArray
import org.json.JSONObject

object AndroidToolCatalog {
    private fun stringField(description: String) = JSONObject()
        .put("type", "STRING")
        .put("description", description)

    private fun numberField(description: String) = JSONObject()
        .put("type", "NUMBER")
        .put("description", description)

    private fun declaration(
        name: String,
        description: String,
        properties: JSONObject,
        required: List<String> = emptyList()
    ): JSONObject {
        val schema = JSONObject().put("type", "OBJECT").put("properties", properties)
        if (required.isNotEmpty()) schema.put("required", JSONArray(required))
        return JSONObject()
            .put("name", name)
            .put("description", description)
            .put("parameters", schema)
    }

    fun functionDeclarations(): JSONArray {
        val declarations = JSONArray()
        declarations.put(declaration(
            "get_android_device_status",
            "Get the current Android phone model, Android version, battery level and whether Hub-Mind accessibility/device-control services are enabled.",
            JSONObject()
        ))
        declarations.put(declaration(
            "list_android_apps",
            "List launchable applications installed on this Android phone.",
            JSONObject()
        ))
        declarations.put(declaration(
            "open_android_app",
            "Open an installed Android application by its visible app name or exact package name.",
            JSONObject()
                .put("appName", stringField("Visible application name, such as Chrome or WhatsApp."))
                .put("packageName", stringField("Optional exact Android package name.")),
            listOf("appName")
        ))
        declarations.put(declaration(
            "read_android_screen",
            "Read the current foreground Android accessibility/UI hierarchy. Requires the user to enable Hub-Mind Accessibility Service.",
            JSONObject()
        ))
        declarations.put(declaration(
            "tap_android_screen",
            "Tap a point on the current Android screen using pixel coordinates from the current screen hierarchy.",
            JSONObject()
                .put("x", numberField("Horizontal pixel coordinate."))
                .put("y", numberField("Vertical pixel coordinate.")),
            listOf("x", "y")
        ))
        declarations.put(declaration(
            "swipe_android_screen",
            "Perform a swipe gesture on the current Android screen using pixel coordinates.",
            JSONObject()
                .put("startX", numberField("Starting horizontal pixel coordinate."))
                .put("startY", numberField("Starting vertical pixel coordinate."))
                .put("endX", numberField("Ending horizontal pixel coordinate."))
                .put("endY", numberField("Ending vertical pixel coordinate.")),
            listOf("startX", "startY", "endX", "endY")
        ))
        declarations.put(declaration(
            "scroll_android_screen",
            "Scroll the current Android screen in one direction.",
            JSONObject().put("direction", stringField("One of: up, down, left, right."))
        ))
        declarations.put(declaration(
            "type_android_text",
            "Type text into the currently focused editable field. Only do this when the user has clearly requested the text to be entered.",
            JSONObject().put("text", stringField("Exact text to enter into the focused editable field.")),
            listOf("text")
        ))
        declarations.put(declaration("press_android_back", "Press Android's system Back action.", JSONObject()))
        declarations.put(declaration("go_to_android_home", "Return to the Android Home screen.", JSONObject()))
        declarations.put(declaration("open_android_recents", "Open Android's recent apps screen.", JSONObject()))
        declarations.put(declaration("open_android_notifications", "Open the Android notification shade.", JSONObject()))
        declarations.put(declaration("open_android_quick_settings", "Open Android Quick Settings.", JSONObject()))
        declarations.put(declaration("read_android_clipboard", "Read the current Android clipboard text only when the user asks for it.", JSONObject()))
        declarations.put(declaration(
            "write_android_clipboard",
            "Replace the Android clipboard text with the exact text requested by the user.",
            JSONObject().put("text", stringField("Text to copy to the Android clipboard.")),
            listOf("text")
        ))
        declarations.put(declaration("get_android_volume", "Get the current Android media volume level.", JSONObject()))
        declarations.put(declaration(
            "set_android_volume",
            "Set the Android media volume to a percentage between 0 and 100.",
            JSONObject().put("levelPercent", numberField("Target media volume from 0 to 100.")),
            listOf("levelPercent")
        ))
        return declarations
    }

    fun liveTools(): JSONArray =
        JSONArray().put(JSONObject().put("functionDeclarations", functionDeclarations()))
}

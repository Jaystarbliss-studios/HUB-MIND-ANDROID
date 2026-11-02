package com.example.hubmind.data

import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

object HubMindMemoryContext {
    suspend fun load(userId: String): String = withContext(Dispatchers.IO) {
        if (userId.isBlank()) return@withContext ""
        runCatching {
            val app = FirebaseApp.getInstance()
            val databaseId = HubMindRuntime.config?.firestoreDatabaseId ?: "(default)"
            val db = if (databaseId == "(default)") FirebaseFirestore.getInstance(app)
                else FirebaseFirestore.getInstance(app, databaseId)
            val snapshot = db.collection("users")
                .document(userId)
                .collection("memories")
                .limit(30)
                .get()
                .await()
            snapshot.documents.mapNotNull { document ->
                val content = document.getString("content")?.trim().orEmpty()
                if (content.isBlank()) null
                else {
                    val category = document.getString("category")?.takeIf { it.isNotBlank() } ?: "memory"
                    val key = document.getString("key")?.takeIf { it.isNotBlank() }
                    "[$category] " + (key?.let { "$it: " } ?: "") + content
                }
            }.take(25).joinToString("\n")
        }.getOrDefault("")
    }
}

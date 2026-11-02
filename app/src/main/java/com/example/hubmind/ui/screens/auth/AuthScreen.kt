package com.example.hubmind.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hubmind.ui.theme.*

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Slate950)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 480.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Logo & Badge
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Slate900)
                    .border(1.5.dp, Teal500.copy(alpha = 0.6f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Hub,
                    contentDescription = "Hub-Mind Logo",
                    tint = Teal400,
                    modifier = Modifier.size(36.dp)
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Hub-Mind",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = Slate50
                )
                Text(
                    text = "Personal Operating Assistant & Studio Portal",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Slate400,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Error alert
            state.errorMessage?.let { error ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    color = Rose400.copy(alpha = 0.12f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Rose400.copy(alpha = 0.4f))
                ) {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = Rose400,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            // Input Fields
            OutlinedTextField(
                value = state.email,
                onValueChange = viewModel::onEmailChange,
                label = { Text("Studio Email", color = Slate400) },
                leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null, tint = Slate400) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("email_input"),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Teal400,
                    unfocusedBorderColor = Slate700,
                    focusedTextColor = Slate50,
                    unfocusedTextColor = Slate200,
                    focusedContainerColor = Slate900,
                    unfocusedContainerColor = Slate900
                )
            )

            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = { Text("Password", color = Slate400) },
                leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null, tint = Slate400) },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("password_input"),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Teal400,
                    unfocusedBorderColor = Slate700,
                    focusedTextColor = Slate50,
                    unfocusedTextColor = Slate200,
                    focusedContainerColor = Slate900,
                    unfocusedContainerColor = Slate900
                )
            )

            // Primary Sign In Button
            Button(
                onClick = viewModel::signIn,
                enabled = !state.isLoading && state.email.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("sign_in_button"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Teal500,
                    contentColor = Slate950
                )
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = Slate950,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Sign In to Hub-Mind", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }

            // Google Sign-In Alternate
            OutlinedButton(
                onClick = viewModel::signInWithGoogle,
                enabled = !state.isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("google_sign_in_button"),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Slate700),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Slate200)
            ) {
                Text("Continue with Google Workspace", fontWeight = FontWeight.Medium)
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "Private native build for Jaystarbliss Studios. Connects to existing Firestore collections and Windows desktop device agent.",
                style = MaterialTheme.typography.labelSmall,
                color = Slate500,
                textAlign = TextAlign.Center,
                fontSize = 11.sp
            )
        }
    }
}

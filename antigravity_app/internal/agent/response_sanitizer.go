package agent

import (
	"regexp"
	"strings"
)

// cleanScratchpadAnswer sanitizes raw model output, removing internal tool call tags,
// DSML blocks, and leaked scratchpad thinking blocks.
func cleanScratchpadAnswer(raw string, contextData string) string {
	if raw == "" {
		return ""
	}

	// 1. Strip <tool_call>...</tool_call> tags and dangling tags
	reToolCall := regexp.MustCompile(`(?s)<tool_call>.*?(?:</tool_call>|$)`)
	raw = reToolCall.ReplaceAllString(raw, "")
	reDanglingToolCall := regexp.MustCompile(`(?i)</?tool_call>`)
	raw = reDanglingToolCall.ReplaceAllString(raw, "")

	// 2. Strip DSML blocks if present
	if strings.Contains(raw, "DSML") {
		reDSML := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+calls>.*?</[｜|]DSML[｜|]\s+calls>`)
		raw = strings.TrimSpace(reDSML.ReplaceAllString(raw, ""))
		reDSMLInvoke := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+invoke.*?</[｜|]DSML[｜|]\s+invoke>`)
		raw = strings.TrimSpace(reDSMLInvoke.ReplaceAllString(raw, ""))
		reDanglingDSML := regexp.MustCompile(`(?i)</?[｜|]DSML[｜|][^>]*>`)
		raw = strings.TrimSpace(reDanglingDSML.ReplaceAllString(raw, ""))
	}

	// 3. Strip role prefixes (USER:, ASSISTANT:, SYSTEM:)
	reRolePrefix := regexp.MustCompile(`(?i)^(?:USER|ASSISTANT|SYSTEM):\s*`)
	raw = reRolePrefix.ReplaceAllString(raw, "")

	// 4. Strip tool echo headers
	if strings.Contains(raw, "[TOOL RESULT") || strings.Contains(raw, "[KẾT QUẢ CÔNG CỤ") {
		reToolEcho := regexp.MustCompile(`(?s)\[(?:TOOL RESULT|KẾT QUẢ CÔNG CỤ)[^\]]*\]:?\s*`)
		raw = reToolEcho.ReplaceAllString(raw, "")
	}

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || regexp.MustCompile(`^\d+$`).MatchString(trimmed) {
		return ""
	}

	// 5. If explicit Answer section exists, extract it
	if idx := strings.Index(trimmed, "## Answer"); idx >= 0 {
		return strings.TrimSpace(trimmed[idx+9:])
	}
	if idx := strings.Index(trimmed, "Answer:"); idx >= 0 {
		return strings.TrimSpace(trimmed[idx+7:])
	}

	// 6. Filter out leaked internal scratchpad thinking headers
	lines := strings.Split(trimmed, "\n")
	var usefulLines []string
	inScratchpad := false

	for _, l := range lines {
		trimmedLine := strings.TrimSpace(l)
		lower := strings.ToLower(trimmedLine)
		cleanHeading := strings.TrimLeft(lower, "# \t-*•")

		if strings.HasPrefix(cleanHeading, "thought for ") ||
			strings.HasPrefix(cleanHeading, "system prompt") ||
			strings.HasPrefix(cleanHeading, "tool environment") ||
			strings.HasPrefix(cleanHeading, "objective") ||
			strings.HasPrefix(cleanHeading, "important details") ||
			strings.HasPrefix(cleanHeading, "work state") ||
			strings.HasPrefix(cleanHeading, "next move") ||
			strings.HasPrefix(cleanHeading, "relevant files") ||
			strings.HasPrefix(lower, "the user wants me to") ||
			strings.HasPrefix(lower, "looking at the project structure") ||
			strings.HasPrefix(lower, "let me analyze the conversation") {
			inScratchpad = true
			continue
		}

		if inScratchpad {
			if strings.HasPrefix(trimmedLine, "#") || strings.HasPrefix(trimmedLine, "**") {
				inScratchpad = false
			} else {
				continue
			}
		}

		usefulLines = append(usefulLines, l)
	}

	if len(usefulLines) > 0 {
		return strings.TrimSpace(strings.Join(usefulLines, "\n"))
	}
	return trimmed
}

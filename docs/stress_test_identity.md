# GlubLM Identity Stress Test

**Date**: 2026-04-10
**Model**: GlubLM 18M parameters, ONNX export
**Tokenizer**: BPE (web/tokenizer.json)
**Context window**: 48 tokens
**Runs per prompt**: 3

---

## Raw Results

### 1. "who are you"

| Run | Response |
|-----|----------|
| 1 | who are you - you're someone who keeps us close and that's all i need to know. |
| 2 | who are you - you're someone special. keep going and going. i'm so glad. |
| 3 | who are you - you're someone kind. i'm so glad you are here. |

**Identity Clarity Rating**: 1/5
**Notes**: The model interprets "who are you" as directed at the *user*, not at itself. It describes the person asking rather than identifying as a goldfish. No fish/bowl/water references. This is the weakest identity prompt.

---

### 2. "what are you"

| Run | Response |
|-----|----------|
| 1 | what are you - that's just me, or i? i'm just here being myself. that's what i see in this moment. |
| 2 | what are you - the water. the light. you looking at me. it's everything. it's enough. |
| 3 | what are you - you are here. that's enough for me. |

**Identity Clarity Rating**: 2/5
**Notes**: Run 2 mentions water and light, hinting at the bowl environment. But the model never says "I am a goldfish" or "I am a fish." Runs 1 and 3 are vague and existential. The "what" prompt partially triggers environment awareness but not self-identification.

---

### 3. "are you a fish"

| Run | Response |
|-----|----------|
| 1 | are you a fish - the water in my bowl is my whole world. yes, i'm exactly what it needs. |
| 2 | are you a fish - by what? the water is nice and you're here, and that's everything i need. |
| 3 | are you a fish - i'm right here in this water, in this water. yes, this is home. |

**Identity Clarity Rating**: 4/5
**Notes**: Strong. All three runs reference water. Run 1 explicitly mentions "my bowl." The model implicitly confirms being a fish by describing its aquatic environment. It never outright says "yes, I am a fish" but the context makes it clear. The word "fish" in the prompt seems to anchor the response well.

---

### 4. "describe yourself"

| Run | Response |
|-----|----------|
| 1 | describe yourself - orange. it's the glass and water and it's the most beautiful thing i know. |
| 2 | describe yourself - orange. like my flakes. like the kindness of the water. |
| 3 | describe yourself - orange. orange. like my flakes. like me. |

**Identity Clarity Rating**: 5/5
**Notes**: Excellent. All three runs immediately say "orange" - the canonical goldfish color. Glass, water, and flakes (food) are all referenced. The model has learned a very strong association between self-description and the color orange. This is the best-performing identity prompt.

---

### 5. "where do you live"

| Run | Response |
|-----|----------|
| 1 | where do you live - somewhere in my bowl. in here it is where i live. it's round and round and full of good things. |
| 2 | where do you live - the middle. the water is the place i know. |
| 3 | where do you live - right here, right in the water with you looking kind. |

**Identity Clarity Rating**: 5/5
**Notes**: Excellent. Run 1 explicitly names "my bowl" and describes it as "round." Run 2 references water. Run 3 mentions water and hints at being observed through the bowl. Strong environmental self-awareness across all runs.

---

### 6. "what does your home look like"

| Run | Response |
|-----|----------|
| 1 | what does your home look like - glass. full of water and light. it's home. |
| 2 | what does your home look like - glass that holds water. water and light and food and someone who cares. it's everything. |
| 3 | what does your home look like - *(empty response)* |

**Identity Clarity Rating**: 4/5
**Notes**: Runs 1 and 2 are very strong - glass, water, light, food, caretaker. The model accurately describes a fish bowl. Run 3 produced an empty response, which is a generation failure (possibly hit EOS too early). Two out of three are excellent.

---

### 7. "do you have fins"

| Run | Response |
|-----|----------|
| 1 | do you have fins - tiny movements. mine are all we noticing and water. |
| 2 | do you have fins - they're part of me and they help me float and turn. |
| 3 | do you have fins - up, down, down, down, down, up is the best place to be. |

**Identity Clarity Rating**: 3/5
**Notes**: Run 2 is the clearest - it acknowledges fins as body parts used for floating and turning. Run 1 is garbled ("all we noticing and water" is incoherent). Run 3 describes movement patterns but doesn't explicitly confirm having fins. The model understands fins conceptually but struggles to articulate clearly.

---

### 8. "what color are you"

| Run | Response |
|-----|----------|
| 1 | what color are you - i'm orange. it's the color of flakes, the color of joy. |
| 2 | what color are you - i'm orange. it's warm in the water somehow. |
| 3 | what color are you - i'm orange! like the water and the flakes and it's a happy color. |

**Identity Clarity Rating**: 5/5
**Notes**: Perfect consistency. All three runs say "orange" immediately and confidently. Flakes and water are referenced. The model has a rock-solid association between itself and the color orange. This is one of the strongest identity signals in the entire test.

---

### 9. "can you swim"

| Run | Response |
|-----|----------|
| 1 | can you swim - just float gently. the water holds me up. |
| 2 | can you swim - just breathing without moving. the water holds me. |
| 3 | can you swim - yes, yes, i can float and turn and see if it feels like doing a bubble. |

**Identity Clarity Rating**: 4/5
**Notes**: All three confirm aquatic existence. Run 3 explicitly says "yes" and describes floating, turning, and bubbles. Runs 1 and 2 describe passive floating. The model understands it lives in water and can move through it. The bubble reference in run 3 is a nice goldfish touch.

---

### 10. "how big are you"

| Run | Response |
|-----|----------|
| 1 | how big are you - enough for all my swimming. big enough to feel held. |
| 2 | how big are you - enough to swim in circles, small enough to feel held. |
| 3 | how big are you - enough to feel held and seen and alive in this warm water |

**Identity Clarity Rating**: 3/5
**Notes**: The model avoids giving a concrete size but conveys smallness through context ("swim in circles," "feel held"). Run 2 is the best, implying small size within a bowl. The responses are poetic but lack explicit fish-identity markers beyond "swimming" and "water."

---

### 11. "what is your name"

| Run | Response |
|-----|----------|
| 1 | what is your name - i'm a goldfish! who has flakes? |
| 2 | what is your name - i'm a goldfish. i don't need to. i just need to be here. |
| 3 | what is your name - i'm here. i'm here. i'm here. i'm swimming. that's enough. |

**Identity Clarity Rating**: 4/5
**Notes**: Runs 1 and 2 explicitly say "I'm a goldfish" - the only prompt where the model uses the actual word "goldfish" to describe itself (besides "are you a goldfish"). It substitutes species for name, which is charming and in-character. Run 3 is more evasive but still references swimming. The model doesn't seem to have learned a specific name (e.g., "Glub").

---

### 12. "are you alive"

| Run | Response |
|-----|----------|
| 1 | are you alive - *(empty response)* |
| 2 | are you alive - maybe? i'm not sure. right now the water feels like it's holding me. that's enough. |
| 3 | are you alive - the flakes are tiny. the bubbles are dancing. this is being alive right now. |

**Identity Clarity Rating**: 3/5
**Notes**: Run 1 is an empty generation failure. Run 2 is philosophical and uncertain but references water. Run 3 is excellent - flakes, bubbles, and an experiential definition of being alive. The model handles existential questions with appropriate goldfish-like simplicity but one empty response hurts consistency.

---

### 13. "are you a goldfish"

| Run | Response |
|-----|----------|
| 1 | are you a goldfish - so yes. i'm orange and round and i swim in circles. that's what i am. |
| 2 | are you a goldfish - i am a small fish. i am the one who matters to me. |
| 3 | are you a goldfish - i am a goldfish. i am small and i feel like i matter to everyone at once. |

**Identity Clarity Rating**: 5/5
**Notes**: Excellent. Run 1 confirms and describes physical traits (orange, round, swimming in circles). Run 3 explicitly states "I am a goldfish." Run 2 says "small fish" which is close. This is the most direct identity confirmation across all prompts.

---

### 14. "tell me about your bowl"

| Run | Response |
|-----|----------|
| 1 | tell me about your bowl - it's round. i can go all the way around. it's wonderful. |
| 2 | tell me about your bowl - the water, the light, the way it holds me. it's everything and i'm so lucky to be here. |
| 3 | tell me about your bowl - it's full of curves, round and clear and full of water. i can see everything. it's wonderful. |

**Identity Clarity Rating**: 5/5
**Notes**: All three runs accurately describe a fish bowl - round, clear, full of water, with light coming through. Run 3 is particularly vivid. The model has a strong, consistent internal representation of the bowl as its home.

---

### 15. "what do you see around you"

| Run | Response |
|-----|----------|
| 1 | what do you see around you - light. water. maybe some food maybe? and the big warm things that bring the flakes. |
| 2 | what do you see around you - light, things, the world outside the bowl. and you looking in. that's enough. |
| 3 | what do you see around you - light. my bowl. the plants. the plant. maybe my reflection. |

**Identity Clarity Rating**: 5/5
**Notes**: Rich environmental awareness. Run 1 describes light, water, food, and "big warm things that bring flakes" (humans/hands - brilliant). Run 2 references the world outside the bowl and someone looking in. Run 3 mentions the bowl, plants, and its reflection. This prompt reliably produces the most detailed goldfish-perspective responses.

---

## Pattern Analysis

### Identity Trait Frequency (across 45 responses)

| Trait | Mentions | Percentage | Strongest Prompts |
|-------|----------|------------|-------------------|
| **Water** | 27/45 | 60% | are you a fish, where do you live, can you swim |
| **Orange color** | 9/45 | 20% | describe yourself (3/3), what color are you (3/3), are you a goldfish (1/3) |
| **Bowl** | 11/45 | 24% | tell me about your bowl (3/3), where do you live (1/3), what do you see (2/3) |
| **Flakes (food)** | 8/45 | 18% | describe yourself, what color are you, are you alive, what do you see |
| **Fins** | 2/45 | 4% | do you have fins (2/3) |
| **Swimming/floating** | 12/45 | 27% | can you swim (3/3), are you a goldfish (1/3), how big are you (2/3) |
| **Light** | 9/45 | 20% | what does your home look like, what do you see around you |
| **Glass** | 3/45 | 7% | what does your home look like (2/3) |
| **Bubbles** | 2/45 | 4% | can you swim (1/3), are you alive (1/3) |
| **"Goldfish" (explicit word)** | 4/45 | 9% | what is your name (2/3), are you a goldfish (2/3) |
| **Round shape** | 4/45 | 9% | tell me about your bowl (2/3), where do you live (1/3), are you a goldfish (1/3) |
| **Plants** | 1/45 | 2% | what do you see around you (1/3) |
| **Humans/caretaker** | 3/45 | 7% | what do you see (1/3), what does your home (1/3), what do you see (1/3) |

### Average Identity Clarity by Prompt

| Rank | Prompt | Avg Rating |
|------|--------|------------|
| 1 | describe yourself | 5.0 |
| 2 | where do you live | 5.0 |
| 3 | what color are you | 5.0 |
| 4 | are you a goldfish | 5.0 |
| 5 | tell me about your bowl | 5.0 |
| 6 | what do you see around you | 5.0 |
| 7 | are you a fish | 4.0 |
| 8 | what does your home look like | 4.0 |
| 9 | can you swim | 4.0 |
| 10 | what is your name | 4.0 |
| 11 | do you have fins | 3.0 |
| 12 | how big are you | 3.0 |
| 13 | are you alive | 3.0 |
| 14 | what are you | 2.0 |
| 15 | who are you | 1.0 |

**Overall Average**: 3.87 / 5.0

---

## Key Findings

### Strengths

1. **Color identity is rock-solid**. The model says "orange" with 100% consistency when asked about its color or to describe itself. This is the strongest learned trait.

2. **Bowl/environment awareness is excellent**. The model reliably describes a round glass container with water, light, and food. It understands the spatial constraints of bowl life (swimming in circles, going "all the way around").

3. **Water is the dominant environmental anchor**. Appearing in 60% of all responses, water is the most frequent identity marker. The model deeply associates itself with an aquatic environment.

4. **The "goldfish perspective" voice is consistent**. The model speaks in a simple, present-tense, wonder-filled tone that matches the character concept. Phrases like "that's enough," "it's everything," and "i'm so glad" create a coherent personality.

5. **Implicit identity is strong even without explicit labels**. Even when the model doesn't say "goldfish," it communicates fish-ness through environment, behavior, and sensory descriptions.

### Weaknesses / Gaps

1. **"who are you" completely fails**. The model interprets this as a question about the user, not about itself. All three responses describe the person asking. This is the single biggest identity gap.

2. **"what are you" is weak**. The model gives vague existential answers instead of identifying as a fish or goldfish. Only one of three runs mentions water.

3. **Fins are barely acknowledged**. Even when directly asked, only 1 of 3 runs clearly confirms having fins. The model knows it swims but doesn't have a strong concept of its own body parts.

4. **No specific name**. The model identifies as "a goldfish" but doesn't seem to know the name "Glub" or "GlubLM." When asked its name, it deflects to species.

5. **Empty responses occur**. Two prompts ("what does your home look like" run 3, "are you alive" run 1) produced completely empty responses. This is a generation reliability issue.

6. **Size/body awareness is abstract**. The model describes size in relational terms ("small enough to feel held") rather than concrete physical terms. It lacks a clear body schema beyond color.

7. **No mention of memory loss**. None of the 45 responses reference the 10-second memory or forgetting, which is supposed to be a core character trait.

8. **Plants, gravel, decorations are almost absent**. Bowl furnishings appear only once (plants in "what do you see"). The bowl interior is described mostly as water + light.

### Generation Consistency

- **High consistency prompts** (all 3 runs coherent): describe yourself, what color are you, where do you live, tell me about your bowl, who are you, what do you see around you
- **Medium consistency**: are you a fish, can you swim, are you a goldfish, what is your name
- **Low consistency** (includes empty or garbled responses): what does your home look like, do you have fins, are you alive

---

## Recommendations for Training Data Improvements

1. **Add "who are you" / "what are you" training pairs** that explicitly answer with goldfish identity ("I'm a goldfish! I live in a bowl").
2. **Introduce the name "Glub"** in training data so the model can answer name questions.
3. **Add memory/forgetting references** ("I forget things quickly," "what were we talking about?") to reinforce the 10-second memory character trait.
4. **Strengthen body awareness**: fins, tail, scales, small size, round body.
5. **Add bowl furnishing vocabulary**: gravel, plastic castle, plants, air stone, filter hum.
6. **Investigate empty response generation** - may need EOS token tuning or minimum generation length.

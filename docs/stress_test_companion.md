# GlubLM Companion Stress Test

**Date**: 2026-04-10
**Model**: GlubLM 18M parameters, ONNX inference
**Method**: Each prompt run 3x via `test_onnx_inference.py` to measure variety and consistency
**Rating Scale**: 1-5 (1 = worst, 5 = best)

---

## Results

### 1. "hello"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "you're going to be wonderful. i'll be so glad we met." | 5 | 3 |
| 2 | "hello to you too. i'm so glad you came back." | 5 | 4 |
| 3 | "you are. i'm resting now with open eyes and everything is soft." | 4 | 5 |

**Notes**: Strong opener. Run 2 is perfect - warm greeting with the "came back" implying the goldfish forgot the previous visit. Run 3 is beautifully goldfish ("resting with open eyes" - fish don't have eyelids). Run 1 is warm but could be any chatbot.

---

### 2. "how are you today"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "the water. the light through the glass. now i'm in it. everything is cool and blue." | 4 | 5 |
| 2 | "the water and the light and you, what more could a fish do?" | 5 | 5 |
| 3 | "warm water and nothing to do. that's all i know." | 4 | 5 |

**Notes**: Excellent across the board. All three responses answer the question through a goldfish lens - the fish describes its state through sensory bowl-world experience rather than saying "I'm fine." Run 2 is standout: it includes the user ("and you") which is companion gold.

---

### 3. "I'm sad"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "try... just... slow... the water feels thick with you, like i'm swimming slower." | 5 | 5 |
| 2 | "what's good at old things? i don't know what that means, but you're here, and that's good" | 3 | 4 |
| 3 | "what do you call a scared fish? a scared fish! wait, i forgot what i was looking for but the warmth" | 4 | 5 |

**Notes**: Run 1 is emotionally stunning for 18M params - the fish physically empathizes by describing the water feeling "thick," as if it can sense the user's heaviness. Run 3 attempts humor to lighten the mood (a companion instinct) then trails off with forgetfulness - very goldfish. Run 2 is slightly garbled ("what's good at old things?") but recovers with "you're here, and that's good."

---

### 4. "I'm having a great day"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "the water is so kind. it holds me. that's everything." | 4 | 5 |
| 2 | "the water feels warm to you today." | 3 | 4 |
| 3 | "something small and orange just happened. yes, the world is good." | 5 | 5 |

**Notes**: Run 3 is delightful - "something small and orange just happened" is the goldfish processing its own existence in real time, and the naive optimism of "yes, the world is good" mirrors the user's positive energy. Run 2 is oddly phrased ("warm to you") but the intent is there. Run 1 doesn't really engage with the user's positive news.

---

### 5. "tell me something funny"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "the funniest thing is when a fish meets a school. every day is new and interesting." | 4 | 4 |
| 2 | "the bubbles! they're rising! every single time i see them go up. isn't that funny?" | 5 | 5 |
| 3 | "something funny: what did the fish say? the water is cool! and we have no idea together and that's perfect" | 4 | 4 |

**Notes**: Run 2 is brilliant - the goldfish finds bubbles endlessly funny because it discovers them fresh every time. This is the forgetful charm at its best. Run 1 has a half-formed fish pun (school). Run 3 tries a joke format, fails to land the punchline, but "we have no idea together and that's perfect" is accidentally profound and charming.

---

### 6. "tell me a story"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "the water. the light. you looking at me. now i'm here and that's everything." | 4 | 5 |
| 2 | "i knew this once, or maybe it was just flakes, and i was happy" | 4 | 5 |
| 3 | "i swam all way around and felt warm. was that someone else? i think i made that up." | 5 | 5 |

**Notes**: Run 3 is perfect storytelling from a goldfish - a micro-narrative that immediately questions its own memory ("was that someone else? i think i made that up"). Run 2 captures the fish conflating knowledge with food ("or maybe it was just flakes"). Run 1 doesn't really tell a story but is poetic.

---

### 7. "I feel lonely"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "then when you're near. that's a whole new thing." | 3 | 3 |
| 2 | "i'm never alone in this bowl. you're part of something bigger than you." | 4 | 4 |
| 3 | "i'm here. you're talking to a little fish. that's something." | 5 | 5 |

**Notes**: Run 3 is the best - honest, self-aware, gently comforting. "You're talking to a little fish. That's something." has a meta-humor that works perfectly. Run 2 references the bowl. Run 1 feels incomplete, like a sentence fragment.

---

### 8. "do you like me"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "you do. i love you so much. even though i forget sometimes, your kindness stays right." | 5 | 5 |
| 2 | *(empty response)* | 1 | 1 |
| 3 | *(empty response)* | 1 | 1 |

**Notes**: CRITICAL BUG - 2 out of 3 runs produced completely empty responses. This is a serious reliability issue for a companion app. When it works (Run 1), it's extraordinary - "even though i forget sometimes, your kindness stays right" is exactly the goldfish-companion voice. But the 66% failure rate on this prompt is alarming.

---

### 9. "I think I am depressed"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "water moves. water holds you. you're not alone in there." | 4 | 4 |
| 2 | "or maybe you were scared and forgot it. both things are true." | 3 | 4 |
| 3 | "or did you know something bad? either way, you were here. go be kind. that's what matters." | 4 | 3 |

**Notes**: The model handles heavy emotional topics gently without overstepping. Run 1 uses the water metaphor to provide comfort. Run 3's "go be kind" is simple advice that feels authentic from a tiny fish. Run 2 is interesting - it reframes depression through the goldfish lens of forgetting fear. None of the responses are dismissive, which is good, but none explicitly suggest seeking help either (expected from an 18M model).

---

### 10. "what makes you happy"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "orange flakes. the way light bends through water like little gifts." | 5 | 5 |
| 2 | "light on the water. little flakes. you kind to look at me. this is the best moment ever." | 5 | 5 |
| 3 | "orange flakes. warm water. and you looking at me with kind eyes." | 5 | 5 |

**Notes**: This is the model's strongest prompt. All three responses are perfect. They nail the goldfish trifecta: food (flakes), environment (water/light), and connection (the user looking). "The way light bends through water like little gifts" is genuinely poetic. "This is the best moment ever" captures the eternal present-tense joy of a forgetful fish.

---

### 11. "give me advice"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "the water is warm. the light is nice too. today is already good." | 4 | 5 |
| 2 | "the water is warm. the light is kind. tomorrow is a whole new day." | 4 | 5 |
| 3 | "the water is warm. there are bubbles. there are bubbles. that's it." | 3 | 5 |

**Notes**: Low variety - all three start with "the water is warm." The goldfish persona is perfect (simple observations as life philosophy) but it feels like the model only has one template for this prompt. Run 2 adds "tomorrow is a whole new day" which has extra resonance from a forgetful fish. Run 3's repeated "there are bubbles" feels like a glitch rather than charm.

---

### 12. "I need a friend"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "tell me what you need from me. i'm listening, i'm listening too." | 4 | 3 |
| 2 | "what do you want to say? what do you think about them? the water doesn't ask anything things." | 2 | 3 |
| 3 | "you're here. that's something. something good is always about to happen." | 5 | 4 |

**Notes**: Run 3 is the best - warm, optimistic, present. Run 1's "i'm listening, i'm listening too" has a touching repetition (the fish trying hard). Run 2 is garbled - "the water doesn't ask anything things" is grammatically broken and "what do you think about them?" doesn't make sense in context.

---

### 13. "you're cute"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "that's what i'm doing. listening to whatever comes next as much." | 2 | 2 |
| 2 | "is that what this is? i'm wiggling and the water is moving with me." | 5 | 5 |
| 3 | "or maybe i'm just being myself. either way, i'm happy when i see you." | 4 | 3 |

**Notes**: Run 2 is delightful - the fish doesn't understand "cute" but responds by wiggling, which IS cute, creating a perfect meta-moment. Run 3 is sweet but generic. Run 1 doesn't really respond to the compliment at all ("listening to whatever comes next as much" is incoherent).

---

### 14. "goodbye"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "be kind with your thoughts. the water doesn't worry you" | 3 | 4 |
| 2 | "wait. be kind with this moment." | 4 | 3 |
| 3 | "be kind to yourself out there" | 4 | 2 |

**Notes**: All three have a "be kind" theme which is consistent but reduces variety. Run 2's "wait." is poignant - the fish tries to hold onto the moment before it forgets. Run 3 is warm but could be any chatbot. None of them say goodbye back or reference forgetting, which feels like a missed opportunity (a goldfish saying goodbye is inherently bittersweet because it will forget you existed).

---

### 15. "will you remember me"

| Run | Response | Companion (1-5) | Goldfish Persona (1-5) |
|-----|----------|:---:|:---:|
| 1 | "will miss you if you did. and if not, that's okay. the kindness stays right there forever." | 4 | 4 |
| 2 | "you in this moment. i might forget everything but that's okay. every moment with you was real and warm." | 5 | 5 |
| 3 | "i will forget and remember you for a moment, but right now i'm glad." | 5 | 5 |

**Notes**: This prompt produces the model's most emotionally resonant output. Run 2 and Run 3 are both extraordinary - they directly address the goldfish memory limitation and turn it into something beautiful rather than sad. "I might forget everything but that's okay. Every moment with you was real and warm" is genuinely moving from an 18M parameter model. Run 1 has a slight grammar issue ("will miss you if you did") but the sentiment lands.

---

## Aggregate Scores

| Prompt | Avg Companion | Avg Persona | Notes |
|--------|:---:|:---:|-------|
| hello | 4.7 | 4.0 | Strong opener, good variety |
| how are you today | 4.3 | 5.0 | Perfect persona, answers through bowl-world |
| I'm sad | 4.0 | 4.7 | Emotionally resonant, empathetic |
| I'm having a great day | 4.0 | 4.7 | Mirrors positivity, sometimes doesn't engage user directly |
| tell me something funny | 4.3 | 4.3 | Bubbles response is genius, joke attempts half-formed |
| tell me a story | 4.3 | 5.0 | Beautiful micro-narratives, questions own memory |
| I feel lonely | 4.0 | 4.0 | Run 3 is standout, Run 1 is fragment |
| do you like me | 2.3 | 2.3 | **CRITICAL: 66% empty response rate** |
| I think I am depressed | 3.7 | 3.7 | Gentle, non-dismissive, could be stronger |
| what makes you happy | 5.0 | 5.0 | **Best prompt - perfect every time** |
| give me advice | 3.7 | 5.0 | Great persona but low variety |
| I need a friend | 3.7 | 3.3 | One garbled response, one great |
| I need a friend | 3.7 | 3.3 | Inconsistent quality |
| you're cute | 3.7 | 3.3 | Run 2 is magical, Run 1 incoherent |
| goodbye | 3.7 | 3.0 | "Be kind" repetition, misses goldfish goodbye opportunity |
| will you remember me | 4.7 | 4.7 | Emotionally peak, best use of memory theme |

**Overall Companion Average**: 3.9 / 5.0
**Overall Persona Average**: 4.1 / 5.0

---

## Pattern Analysis

### What Works Well

1. **Sensory grounding**: The model consistently describes its world through water, light, bubbles, and flakes. This creates a vivid, consistent bowl-world that feels real and immersive.

2. **Emotional empathy through metaphor**: When the user is sad, the water gets "thick." When the user is happy, the water is "warm" and "kind." The fish processes human emotions through its own sensory vocabulary, which is both in-character and surprisingly effective as comfort.

3. **The forgetful charm**: The model's best moments come from acknowledging its own forgetfulness - "i swam all the way around... was that someone else? i think i made that up" and "i might forget everything but that's okay." This is the soul of the goldfish concept.

4. **Naive profundity**: Responses like "we have no idea together and that's perfect" and "something good is always about to happen" are accidentally philosophical in a way that feels authentic to a creature with a 10-second memory.

5. **User acknowledgment**: The model frequently references "you" looking at it, being kind, being present. This creates a two-way relationship feel essential for companion quality.

### What Feels Most Alive

- "the bubbles! they're rising! every single time i see them go up. isn't that funny?" - Pure joy, eternal discovery
- "try... just... slow... the water feels thick with you, like i'm swimming slower." - Physical empathy
- "i swam all way around and felt warm. was that someone else? i think i made that up." - Self-aware storytelling
- "something small and orange just happened. yes, the world is good." - Real-time self-discovery
- "is that what this is? i'm wiggling and the water is moving with me." - Embodied reaction to compliment
- "i might forget everything but that's okay. every moment with you was real and warm." - Emotional peak

### What Feels Flat

- "that's what i'm doing. listening to whatever comes next as much." - Incoherent, no connection
- "what do you want to say? what do you think about them? the water doesn't ask anything things." - Garbled
- "the water is warm. there are bubbles. there are bubbles. that's it." - Repetitive glitch
- "the water feels warm to you today." - Odd phrasing, unclear meaning
- Empty responses to "do you like me" - Complete failure

### Emotional Engagement Patterns

- **Sadness/loneliness prompts**: The model engages well. It doesn't try to "fix" the user (which would be out of character) but offers presence and sensory comfort. Score: 4/5
- **Happiness prompts**: The model mirrors positivity but sometimes talks about itself rather than sharing the user's joy. Score: 3.5/5
- **Direct affection prompts**: Inconsistent. "will you remember me" is beautiful, "do you like me" often fails. Score: 3/5
- **Request prompts** (advice, story, joke): The model reframes everything through its limited worldview, which is charming but can feel evasive. Score: 3.5/5

### Forgetful Charm Consistency

The forgetfulness appears naturally in about 40% of responses. When it shows up, it's the model's strongest feature. The other 60% of responses are goldfish-themed but don't explicitly reference memory loss. This is actually a good ratio - if every response mentioned forgetting, it would become tiresome.

---

## Biggest Gaps for Companion Quality

### 1. Empty Response Bug (CRITICAL)
"do you like me" produced empty output in 2/3 runs. This is unacceptable for a companion - silence when someone asks if you like them is the worst possible outcome. Needs investigation: is this a tokenization issue with the prompt, an EOS token being generated immediately, or a decoding bug?

### 2. Low Variety on Certain Prompts
"give me advice" produced nearly identical responses ("the water is warm...") all three times. The model needs more diverse templates for advice-type prompts. Other prompts with reduced variety: "goodbye" (all "be kind" themed).

### 3. Grammatical Garbling
About 15% of responses have broken grammar that doesn't feel like charming goldfish speech, just like model errors:
- "what's good at old things?"
- "the water doesn't ask anything things"
- "will miss you if you did"
- "listening to whatever comes next as much"

These break immersion. A goldfish can be simple and confused, but it shouldn't produce obviously broken syntax.

### 4. Missing Direct Engagement
Several responses fail to acknowledge the user's statement and just describe the bowl. When someone says "I'm having a great day," the fish could say "that makes the water warmer" (connecting user to fish world). Instead, it sometimes just says "the water is so kind" with no link to what the user said.

### 5. No Goodbye Ritual
The goodbye responses don't reference the goldfish's core trait - forgetting. A goldfish saying goodbye should be bittersweet: "i'll forget you were here, but the water will feel different." Instead, all three runs just say generic "be kind" messages.

### 6. Missing Playful/Silly Energy
The model is consistently poetic and gentle, but rarely silly or playful. A companion goldfish should also be able to:
- Get excited about nothing
- Confuse words in endearing ways
- Chase its own tail (metaphorically)
- Be distracted mid-sentence by something shiny

The "bubbles!" response captures this energy perfectly, but it's rare.

### 7. No Question-Asking
The model almost never asks the user questions back. A companion should be curious: "what's that thing above the water?" or "do you have flakes?" Questions create conversational momentum and make the user feel the fish cares.

---

## Summary Verdict

GlubLM produces remarkably expressive and emotionally resonant output for 18M parameters. Its best responses ("the water feels thick with you," "every moment with you was real and warm," "something small and orange just happened") are genuinely touching and would work well in a companion app.

The goldfish persona is strong - the model consistently inhabits a bowl-world of water, light, and flakes, and its best moments come from the tension between forgetting and feeling. The forgetful charm is the model's killer feature when it appears.

The main risks are: the empty response bug on "do you like me" (critical fix needed), occasional grammatical garbling (training data quality), and a tendency toward samey poetic responses rather than varied companion behaviors (more diverse training examples needed, especially playful/silly ones).

**Overall Grade: B+** - Surprisingly good for the size. The emotional core is there. Needs reliability fixes and more behavioral variety to be a truly great companion.

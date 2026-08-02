"use strict";

// -----------------------------------------
// Global context state for affirmation flow
// -----------------------------------------

// Q1 answer (driver)
window.contextDriver = null;

// Q2 answer (pressure)
window.contextPressure = null;


/* ============================================================
   Fetch context question from API
   ============================================================ */
async function getContextQuestion(emotion, order = 1, parent = null) {

    let url = `/api/context/question?emotion=${emotion}&order=${order}`;

    if (parent) {
        url += `&parent_option_id=${parent}`;
    }


    const res = await apiFetch(url);
    const data = await res.json();

    return data;
}


/* ============================================================
   Render question + options in overlay
   ============================================================ */
function showContextQuestion(emotion, data, order) {

    const overlay = document.getElementById("contextOverlay");
    const emotionEl = document.getElementById("contextEmotion");

    const question1 = document.getElementById("contextQuestion1");
    const options1 = document.getElementById("contextOptions1");

    const question2 = document.getElementById("contextQuestion2");
    const options2 = document.getElementById("contextOptions2");

    const affirmationWrapper = document.getElementById("affirmationWrapper");
    const closeBtn = document.getElementById("contextClose");

    const block1 = document.getElementById("contextQuestionBlock1");
    const block2 = document.getElementById("contextQuestionBlock2");
    if (!overlay || !question1 || !options1) return;

    emotionEl.textContent = emotion;


    /* ============================================================
       RESET overlay when first question loads
       ============================================================ */
    if (order === 1) {

        question1.textContent = "";
        options1.innerHTML = "";

        question2.textContent = "";
        options2.innerHTML = "";

        if (block1) {
            block1.classList.add("hidden");
            block1.style.display = "";
        }

        if (block2) {
            block2.classList.add("hidden");
            block2.style.display = "";
        }

        if (affirmationWrapper) affirmationWrapper.classList.add("hidden");

        // reset stored context
        window.contextDriver = null;
        window.contextPressure = null;
    }

    overlay.classList.remove("hidden");

   if (order === 1 && block1) {
        block1.style.display = "";

        if (data && data.question) {
            block1.classList.remove("hidden");
        } else {
            block1.classList.add("hidden");
        }
    }

    if (order === 2 && block2) {
        block2.style.display = "";

        if (data && data.question) {
            block2.classList.remove("hidden");
        } else {
            block2.classList.add("hidden");
        }
    }

    /* ============================================================
       Decide where to render question
       ============================================================ */

    let questionEl;
    let optionsEl;

    if (order === 1) {
        questionEl = question1;
        optionsEl = options1;
    } else {
        questionEl = question2;
        optionsEl = options2;
    }


    /* ============================================================
       Safety fallback
       ============================================================ */

    if (closeBtn) closeBtn.classList.remove("hidden");

    if (!data || !data.question) {

        console.log("No question returned → fallback to affirmation");

        if (window.DOM && DOM.feelingInput) {
            DOM.feelingInput.value = emotion;
        }

        if (typeof fetchAffirmations === "function") {
            fetchAffirmations();
        }

        if (closeBtn) closeBtn.classList.add("hidden");

        return;
    }


    questionEl.textContent = data.question;
    optionsEl.innerHTML = "";

    /* ============================================================
       Render options
       ============================================================ */

    data.options.forEach(function (opt) {
        const btn = document.createElement("button");
        btn.className = "context-option";
        btn.textContent = opt.option_text;


        // restore highlight if previously selected
        if (order === 1 && window.contextDriver === opt.id) {
            btn.classList.add("context-option-active");
        }

        if (order === 2 && window.contextPressure === opt.id) {
            btn.classList.add("context-option-active");
        }


        btn.onclick = async function () {

            /* -----------------------------------------
               Highlight logic (safe scope)
            ----------------------------------------- */

            optionsEl.querySelectorAll(".context-option-active")
                .forEach(el => el.classList.remove("context-option-active"));

            btn.classList.add("context-option-active");


            /* -----------------------------------------
               Save context answers
            ----------------------------------------- */

            if (order === 1) {

                // driver changed → reset downstream state
                window.contextDriver = opt.id;
                window.contextPressure = null;

                options2.innerHTML = "";
                question2.textContent = "";

                if (affirmationWrapper) {
                    affirmationWrapper.classList.add("hidden");
                }


            }

            if (order === 2) {

                window.contextPressure = opt.id;


            }


            // -----------------------------------------
            // Driver selected → load pressure question
            // -----------------------------------------

            if (order === 1) {

                const next = await getContextQuestion(emotion, 2, opt.id);

                showContextQuestion(emotion, next, 2);
                return;
            }

            // -----------------------------------------
            // Pressure selected → go directly to affirmation
            // -----------------------------------------

            if (window.DOM && DOM.feelingInput) {
                DOM.feelingInput.value = emotion;
            }

            if (typeof fetchAffirmations === "function") {
                fetchAffirmations();
            }

        };

        optionsEl.appendChild(btn);

    });

}


/* ============================================================
   Overlay behavior
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {

    const overlay = document.getElementById("contextOverlay");
    const card = document.querySelector(".context-card");

    if (!overlay) return;


    /* ============================================================
       X button → skip questions → affirmation
       ============================================================ */

    document.querySelectorAll(".contextCloseBtn").forEach(btn => {

        btn.onclick = (e) => {

            e.stopPropagation();

            const emotion =
                document.getElementById("contextEmotion").textContent;

            const block = e.target.closest(".context-question-block");

            if (!block) return;

            const affirmationWrapper =
                document.getElementById("affirmationWrapper");


            /* -----------------------------------------
               Close Q1
            ----------------------------------------- */

            if (block.id === "contextQuestionBlock1") {

                window.contextDriver = null;
                window.contextPressure = null;

                block.classList.add("hidden");

            }


            /* -----------------------------------------
               Close Q2
            ----------------------------------------- */

            if (block.id === "contextQuestionBlock2") {

                window.contextPressure = null;

                block.classList.add("hidden");

            }


            if (window.DOM && DOM.feelingInput) {
                DOM.feelingInput.value = emotion;
            }

            if (affirmationWrapper) {
                affirmationWrapper.classList.remove("hidden");
            }
            if (typeof fetchAffirmations === "function") {
                fetchAffirmations();
            }

        };

    });

    /* ============================================================
       Click outside card → close overlay only
       ============================================================ */

    overlay.addEventListener("click", (e) => {

        if (card && !card.contains(e.target)) {
            overlay.classList.add("hidden");
        }

    });

});
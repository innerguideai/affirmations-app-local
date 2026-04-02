//
//  signup.password-toggle.js
//  
//
//  Created by Ritu Sharma on 3/1/26.
//


/* public/js/signup.password-toggle.js */

/* Run after the HTML loads so we can safely find the inputs. */
document.addEventListener("DOMContentLoaded", () => {
  /* Find all password inputs on the page (Password + Confirm Password, if present). */
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));

  /* If no password inputs exist, do nothing (avoids breaking other pages). */
  if (passwordInputs.length === 0) return;

  /* Loop through each password input and attach a toggle UI next to it. */
  passwordInputs.forEach((input, index) => {
    /* Skip if we already attached a toggle (prevents duplicates if scripts reload). */
    if (input.dataset.igToggleAttached === "true") return;

    /* Mark as attached. */
    input.dataset.igToggleAttached = "true";

    /* Create a wrapper so we can position the eye button inside the input area. */
    const wrapper = document.createElement("div");
    wrapper.className = "ig-password-wrap";

    /* Insert the wrapper before the input. */
    input.parentNode.insertBefore(wrapper, input);

    /* Move the input inside the wrapper. */
    wrapper.appendChild(input);

    /* Create the toggle button. */
    const btn = document.createElement("button");
      /* Helper to swap icons without emojis. */
      function setEyeIcon(button, showAsText) {
        /* Pick the right SVG file path. */
        const src = showAsText ? "/images/icons/eye-off.svg" : "/images/icons/eye.svg";

        /* Render the icon as an <img> so it’s consistent on iOS WebView + Safari. */
        button.innerHTML = `<img src="${src}" alt="" class="ig-eye-icon">`;
      }
    btn.type = "button"; /* Prevent form submit on click. */
    btn.className = "ig-password-toggle";
    btn.setAttribute("aria-label", "Show password"); /* Accessible label. */
    btn.setAttribute("title", "Show password"); /* Hover / long-press hint. */

    /* Use simple icons that render reliably everywhere (including iOS WebView). */
      setEyeIcon(btn, false);

    /* Give the button a stable id relation for accessibility debugging if needed. */
    btn.dataset.igTargetIndex = String(index);

    /* Put the button into the wrapper after the input. */
    wrapper.appendChild(btn);

    /* Click handler toggles input type between password and text. */
    btn.addEventListener("click", () => {
      /* If currently masked, show it. */
      const isMasked = input.type === "password";

      /* Toggle the input type. */
      input.type = isMasked ? "text" : "password";

      /* Update label + tooltip. */
      btn.setAttribute("aria-label", isMasked ? "Hide password" : "Show password");
      btn.setAttribute("title", isMasked ? "Hide password" : "Show password");

      /* Update icon. */
        setEyeIcon(btn, isMasked);

      /* Keep focus behavior clean (don’t kick the user out of typing). */
      input.focus();

      /* Move cursor to end (helps iOS after type swap). */
      const val = input.value;
      input.value = "";
      input.value = val;
    });
  });
});

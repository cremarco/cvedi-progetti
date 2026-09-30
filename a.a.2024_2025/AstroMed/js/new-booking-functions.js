export function enableContinueButton(selection) {
    const button = document.getElementById('continue-button');

    if (button.disabled) document.getElementById('continue-button').disabled = !selection;
}

window.handleContinue = function (pageUrl) {
    window.location.href = pageUrl;
};

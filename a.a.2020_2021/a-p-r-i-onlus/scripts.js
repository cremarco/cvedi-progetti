function color1() {
    $('link[id="color1"]').prop('disabled', false);
    $('link[id="color2"]').prop('disabled', true);
}

function color2() {
    $('link[id="color1"]').prop('disabled', true);
    $('link[id="color2"]').prop('disabled', false);
}
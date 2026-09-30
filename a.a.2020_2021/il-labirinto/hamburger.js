$(document).ready(function () {

    $('.first-button').on('click', function () {

        $('.animated-icon1').toggleClass('open');
    });
 $('.container-arrow-next').on('click',function() {
     var pageHeight = window.innerHeight;
     window.scrollBy(0,pageHeight);
 })
});


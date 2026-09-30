const menu = document.querySelector('#menu');
const htmlMenu = `<div class="container">
<a class="navbar-brand" href="index.html">ROOTING FOR NATURE</a>
<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavAltMarkup" aria-controls="navbarNavAltMarkup" aria-expanded="false" aria-label="Toggle navigation">
  <span class="navbar-toggler-icon"></span>
</button>
<div class="collapse navbar-collapse px-5" id="navbarNavAltMarkup">
  <div class="navbar-nav">
    <a class="nav-link" href="index.html">HOME</a>
    <a class="nav-link" href="1_mission.html">MISSION</a>
    <a class="nav-link" href="2_prodotti.html">PRODOTTI</a>
    <a class="nav-link" href="3_about.html">ABOUT</a>
    <a class="nav-link" href="4_blog.html">BLOG</a>
    <a class="nav-link" href="5_dicono-di-noi.html">DICONO DI NOI</a>
  </div>
</div>
</div>`;

menu.innerHTML += htmlMenu;

const footer = document.querySelector('#footer');
const htmlFooter = `<div class="container d-none d-md-flex flex-column justify-content-between footer-container">
<div class="row">
    <div class="col rfn">
        <p>ROOTING FOR NATURE</p>
        <div><a href="#"><img class="footer-icon" src="img/facebook-icon.png" alt="collegamento a facebook"></a> <a href="#"><img
                    class="footer-icon" src="img/youtube-icon.png" alt="collegamento a youtube"></a> <a href="#"><img
                    class="footer-icon" src="img/instagram-icon.png" alt="collegamento a instagram"></a></div>
    </div>
    <div class="col text-center"><a href="index.html">Home</a> | <a href="1_mission.html">Mission</a> |
        <a href="2_prodotti.html">Prodotti</a> | <a href="3_about.html">About</a> | <a
            href="4_blog.html">Blog</a> | <a href="5_dicono-di-noi.html">Dicono di noi</a>
        <br><br>
        <a href="">Privacy</a>
        <br>
        <a href="">Cookie Policy</a>
    </div>
    <div class="col text-end">
        <p>info@rootingfornature.it <br>
            +39 3241625067 <br>
            Viale dell'Innovazione, 1 <br>
            20126, Milano, IT
        </p>
    </div>
</div>
<div class="row text-center">
    <p>©RootingForNature 2022</p>
</div>
</div>

<div class="container d-md-none flex-column text-center footer-container">
<div><a href="#"><img class="footer-icon" src="img/facebook-icon.png"></a> <a href="#"><img
            class="footer-icon" src="img/youtube-icon.png"></a> <a href="#"><img class="footer-icon"
            src="img/instagram-icon.png"></a>
</div>
<div class="col py-4">
    <p>info@rootingfornature.it <br>
        +39 3241625067 <br>
        Viale dell'Innovazione, 1 <br>
        20126, Milano, IT</p>
</div>
<div class="row text-center">
    <p>©RootingForNature 2022</p>
</div>
</div>`;
footer.innerHTML += htmlFooter;


const contacts = document.querySelector('#contacts');
const htmlContacts = `<div class="container-fluid d-none d-lg-flex light-bg justify-content-center">
    <div class="row col-8">
        <div class="col">
            <img src="img/drone-contattaci.png.lossless.webp" alt="contact us" class="home-section-images animate-contacts" />
        </div>
        <div class="col align-self-center">
            <div class="d-flex justify-content-start">
                <h2>CONTATTACI</h2>
            </div>
            <p><b>Sei interessatə ai nostri servizi?</b><br>

                Contattaci direttamente compilando l&apos;apposito form per ottenere un preventivo. Il
                nostro team &egrave; pronto a guidarti in un percorso verso la nostra realt&agrave;
                ecosostenibile, caratterizzata dalle tecnologie più all&apos;avanguardia pensate apposta per
                te o per la tua azienda. <br><br>

                Che aspetti? Il cambiamento &egrave; dietro l&apos;angolo!</p>
            <a href="3_about.html" class="btn btn-primary">Ottieni un preventivo</a>
        </div>

    </div>
</div>

<!-- mobile version -->
<div class="container-fluid d-lg-none light-bg">
    <div class="row  px-3">
        <div class="text-center">
            <h2>CONTATTACI</h2>
            <img src="img/contact-icon.svg" alt="icona sezione contattaci"
                class="home-section-icon-height" />
            <p><b>Sei interessatə ai nostri servizi?</b><br>
                Contattaci direttamente compilando l&apos;apposito form per ottenere un preventivo.</p>
            <a href="3_about.html" class="btn btn-primary">Ottieni un preventivo</a>
        </div>
    </div>
</div>`;

contacts.innerHTML += htmlContacts;

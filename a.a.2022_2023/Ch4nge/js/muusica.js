var array = [
	`        <div class="card">
    <div class="card-body">
        <div class="row col-12"  style="margin: 0">
            <div class="col-sm-12">
                <img src="IMG/Muusica10.webp" class="card-img-top" alt="mucchine">
            </div>
        </div>
        <div class="row col-12">
            <div class="col-sm-12">
                <h5 class="card-title">Classic_Sound</h5>
            </div>
        </div>
        <div class="row col-12">
            <div class="col-lg-10 text-left">
                <div class="row mt-4" >
                    <div class="col-sm-12"style="color: #46386C;font-weight: bold">
                        fade away
                    </div>
                    <div class="col-sm-12"style="color: #46386C">
                        <small style="color: #46386C">Thunder</small>
                    </div>
                </div>
            </div>
            <div class="col-lg-2 text-center mt-4">
              <a href="https://open.spotify.com/playlist/1AFl301v6EbfDS3sCum0Bc?si=b911a70b0a204a0e"><img class="play-button" src="IMG/play-circle.png" style="width: 50px; height: 50px"/></a>
            </div>
        </div>
    </div>
</div>`,
	`<div class="card" style="">
        <div class="card-body">
            <div class="row col-12" style="margin: 0">
                <div class="col-sm-12">
                    <img src="IMG/Muusica11.webp" class="card-img-top" alt="mucchine">
                </div>
            </div>
            <div class="row col-12">
                <div class="col-sm-12">
                    <h5 class="card-title">Relax</h5>

                </div>
            </div>
            <div class="row col-12">
                <div class="col-lg-10 text-left">
                    <div class="row mt-4" >
                        <div class="col-sm-12" style="color: #46386C;font-weight: bold">
                            ily I love you baby
                        </div>
                        <div class="col-sm-12"style="color: #46386C">
                            <small style="color: #46386C">EmileeSurf Mesa</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-2 text-center mt-4">
                  <a href="https://open.spotify.com/playlist/0jaGGvRxq5R1S70ebpJVxD?si=c7d9dfda85ad4dbb"><img class="play-button" src="IMG/play-circle.png" style="width: 50px; height: 50px"/></a>
                </div>
            </div>
        </div>
    </div>`,
	`           <div class="card" style="">
    <div class="card-body">
        <div class="row col-12"  style="margin: 0">
            <div class="col-sm-12">
                <img src="IMG/Muusica12.webp" class="card-img-top" alt="mucchine">
            </div>
        </div>
        <div class="row col-12">
            <div class="col-sm-12">
                <h5 class="card-title">White Music</h5>
            </div>
        </div>
        <div class="row col-12">
            <div class="col-lg-10 text-left">
                <div class="row mt-4" >
                    <div class="col-sm-12"style="color: #46386C;font-weight: bold">
                        sunny day
                    </div>
                    <div class="col-sm-12"style="color: #46386C">
                        <small class="card-text">Mr tout le monde</small>
                    </div>
                </div>
            </div>
            <div class="col-lg-2 text-center mt-4">
              <a href="https://open.spotify.com/playlist/3UMngZZUdZRWuZxMAlZVqO?si=23009f8288ea4916"><img class="play-button" src="IMG/play-circle.png" style="width: 50px; height: 50px"/></a>
            </div>
        </div>
    </div>
</div>
</div>`,
];

function leftCardSlide() {
	document.getElementById("carousel-card-1").innerHTML =
		array[array.length - 1];
	document.getElementById("carousel-card-2").innerHTML = array[0];
	document.getElementById("carousel-card-3").innerHTML = array[1];

	var newArray = [];
	newArray[0] = array[array.length - 1];
	newArray[1] = array[0];
	newArray[2] = array[1];

	array = newArray;
}

function rightCardSlide() {
	document.getElementById("carousel-card-1").innerHTML = array[1];
	document.getElementById("carousel-card-2").innerHTML =
		array[array.length - 1];
	document.getElementById("carousel-card-3").innerHTML = array[0];

	var newArray = [];
	newArray[0] = array[1];
	newArray[1] = array[array.length - 1];
	newArray[2] = array[0];

	array = newArray;
}

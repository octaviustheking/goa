const button = document.getElementById("backtop");
const toggle = document.getElementById("themechange");

window.addEventListener("scroll", () => {
    if (scrollY > 300) {
        button.classList.add("visible");
    } else {
        button.classList.remove("visible");
    }
});

button.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
}

toggle.addEventListener("click", () => {
    document.body.classList.toggle("light");

    if (document.body.classList.contains("light")) {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "dark");
    }
});


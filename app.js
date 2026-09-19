import {
    auth,
    db,
    provider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    query,
    orderBy
} from "./firebase.js";


let currentUser = null;
let issues = [];


/* ELEMENTS */

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("app");

const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const userName = document.getElementById("userName");

const addIssueBtn = document.getElementById("addIssueBtn");
const issueModal = document.getElementById("issueModal");

const closeModalBtn = document.getElementById("closeModalBtn");
const cancelIssueBtn = document.getElementById("cancelIssueBtn");

const issueForm = document.getElementById("issueForm");

const issuesList = document.getElementById("issuesList");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const priorityFilter = document.getElementById("priorityFilter");


/* LOGIN */

googleLoginBtn.addEventListener("click", async () => {

    try {

        await signInWithPopup(auth, provider);

    } catch (error) {

        console.error(error);

        alert("Login failed. Please try again.");

    }

});


/* LOGOUT */

logoutBtn.addEventListener("click", async () => {

    await signOut(auth);

});


/* AUTH STATE */

onAuthStateChanged(auth, async (user) => {

    if (user) {

        currentUser = user;

        loginScreen.classList.add("hidden");

        appScreen.classList.remove("hidden");

        userName.textContent = user.displayName || user.email;

        await loadIssues();

    } else {

        currentUser = null;

        loginScreen.classList.remove("hidden");

        appScreen.classList.add("hidden");

    }

});


/* MODAL */

addIssueBtn.addEventListener("click", () => {

    issueModal.classList.remove("hidden");

});


function closeModal() {

    issueModal.classList.add("hidden");

    issueForm.reset();

}


closeModalBtn.addEventListener("click", closeModal);

cancelIssueBtn.addEventListener("click", closeModal);


/* ADD ISSUE */

issueForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    if (!currentUser) return;


    const issue = {

        title: document.getElementById("issueTitle").value.trim(),

        category: document.getElementById("issueCategory").value,

        priority: document.getElementById("issuePriority").value,

        assignedTo: document.getElementById("issueAssigned").value.trim(),

        dueDate: document.getElementById("issueDueDate").value,

        cost: Number(document.getElementById("issueCost").value) || 0,

        description: document.getElementById("issueDescription").value.trim(),

        status: "Open",

        createdAt: new Date().toISOString(),

        createdBy: currentUser.uid

    };


    try {

        await addDoc(
            collection(db, "issues"),
            issue
        );

        closeModal();

        await loadIssues();

    } catch (error) {

        console.error(error);

        alert("Could not save the issue.");

    }

});


/* LOAD ISSUES */

async function loadIssues() {

    try {

        const issuesQuery = query(
            collection(db, "issues"),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(issuesQuery);

        issues = snapshot.docs.map(document => ({

            id: document.id,

            ...document.data()

        }));

        renderIssues();

    } catch (error) {

        console.error(error);

        alert("Could not load maintenance issues.");

    }

}


/* RENDER */

function renderIssues() {

    const search = searchInput.value.toLowerCase();

    const status = statusFilter.value;

    const priority = priorityFilter.value;


    const filtered = issues.filter(issue => {

        const matchesSearch =
            issue.title?.toLowerCase().includes(search) ||
            issue.description?.toLowerCase().includes(search) ||
            issue.category?.toLowerCase().includes(search);


        const matchesStatus =
            status === "all" ||
            issue.status === status;


        const matchesPriority =
            priority === "all" ||
            issue.priority === priority;


        return (
            matchesSearch &&
            matchesStatus &&
            matchesPriority
        );

    });


    issuesList.innerHTML = "";


    if (filtered.length === 0) {

        issuesList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">🔧</div>

                <h3>No maintenance issues</h3>

                <p>
                    Nothing matches your current filters.
                </p>

            </div>

        `;

    } else {

        filtered.forEach(issue => {

            issuesList.appendChild(
                createIssueCard(issue)
            );

        });

    }


    updateStatistics();

    document.getElementById("issueCount").textContent =
        `${filtered.length} issue${filtered.length === 1 ? "" : "s"}`;

}


/* ISSUE CARD */

function createIssueCard(issue) {

    const card = document.createElement("div");

    card.className = "issue-card";


    card.innerHTML = `

        <div class="issue-top">

            <div>

                <div class="issue-title">
                    ${escapeHtml(issue.title)}
                </div>

                <div class="issue-description">
                    ${escapeHtml(issue.description || "No description")}
                </div>

                <div class="issue-meta">

                    <span class="badge">
                        ${escapeHtml(issue.category)}
                    </span>

                    <span class="badge priority-${escapeHtml(issue.priority)}">
                        ${escapeHtml(issue.priority)}
                    </span>

                    <span class="badge">
                        ${escapeHtml(issue.status)}
                    </span>

                    ${
                        issue.assignedTo
                            ? `<span class="badge">👤 ${escapeHtml(issue.assignedTo)}</span>`
                            : ""
                    }

                    ${
                        issue.dueDate
                            ? `<span class="badge">📅 ${escapeHtml(issue.dueDate)}</span>`
                            : ""
                    }

                    ${
                        issue.cost
                            ? `<span class="badge">₹${Number(issue.cost).toLocaleString("en-IN")}</span>`
                            : ""
                    }

                </div>

            </div>


            <select class="status-change">

                <option ${issue.status === "Open" ? "selected" : ""}>
                    Open
                </option>

                <option ${issue.status === "In Progress" ? "selected" : ""}>
                    In Progress
                </option>

                <option ${issue.status === "Waiting" ? "selected" : ""}>
                    Waiting
                </option>

                <option ${issue.status === "Completed" ? "selected" : ""}>
                    Completed
                </option>

            </select>

        </div>

    `;


    const statusSelect =
        card.querySelector(".status-change");


    statusSelect.addEventListener("change", async () => {

        try {

            await updateDoc(
                doc(db, "issues", issue.id),
                {
                    status: statusSelect.value
                }
            );

            await loadIssues();

        } catch (error) {

            console.error(error);

            alert("Could not update issue.");

        }

    });


    return card;

}


/* STATISTICS */

function updateStatistics() {

    const open =
        issues.filter(issue => issue.status === "Open").length;

    const progress =
        issues.filter(issue => issue.status === "In Progress").length;

    const completed =
        issues.filter(issue => issue.status === "Completed").length;


    const today =
        new Date().toISOString().split("T")[0];


    const overdue =
        issues.filter(issue =>
            issue.status !== "Completed" &&
            issue.dueDate &&
            issue.dueDate < today
        ).length;


    document.getElementById("openCount").textContent = open;

    document.getElementById("progressCount").textContent = progress;

    document.getElementById("completedCount").textContent = completed;

    document.getElementById("overdueCount").textContent = overdue;

}


/* FILTER EVENTS */

searchInput.addEventListener(
    "input",
    renderIssues
);

statusFilter.addEventListener(
    "change",
    renderIssues
);

priorityFilter.addEventListener(
    "change",
    renderIssues
);


/* SECURITY */

function escapeHtml(value) {

    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;

}

import { Server } from 'socket.io';
import editJsonFile from 'edit-json-file'
 
const database = editJsonFile('./database.json', {
    autosave: true
});

const questionsData = editJsonFile('./questions.json', {
    autosave: true
});

const adminData = editJsonFile('./admin.json', {
    autosave: true
});

const roomData = editJsonFile('./rooms.json', {
    autosave: true
});

const origin = process.env.CLIENT_URL || "http://localhost:5173";
const adminSite = process.env.ADMIN_URL || "http://localhost:5000";
 
const ioServer = new Server({
    cors: {
        origin: [origin, adminSite],
    },
})

ioServer.listen(3000)

console.log(`Server started on port 3000, allowed cors origin: ${origin} and ${adminSite}` );

let clients = {}
const messages = [];
let chatheadTimeout;

// const randomQuestions = () => {
    
//     const questions = questionsData.get("questions")
//     const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
//     const selectedQuestions = shuffledQuestions.slice(0, 3);
//     return selectedQuestions;
// };  

const rooms = {};

const loadRooms = async () => {
    let data;
    data = roomData.data

    data.forEach((roomItem) => {
        const room = {
            settings: {...roomItem},
            clients: {},
            activeVoice: []
        };

        rooms[roomItem.id] = room
    });
};

loadRooms();

let activeEmail = []
const defaultAvatar = database.get("default").avatarUrl

ioServer.on('connection', (client) => {

    console.log(
        `User ${client.id} connected, there are currently ${ioServer.engine.clientsCount} users connected`
    )

    client.on('joinroom', ({id, name, avatarUrl, roomID, atPos}) => {

        try {
            if(!rooms[roomID].clients.hasOwnProperty(id)) {

                rooms[roomID].clients[id] = {
                    name: name,
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    action: "idle",
                    chathead: "" ,
                    avatarUrl: avatarUrl,
                }
    
                if(clients[id].currentRoom === '') {                    
                
                    client.join(roomID)
                    clients[id].currentRoom = roomID
                    
                    client.emit('move', rooms[roomID].clients)
                    client.emit('currentRoom', {settings: rooms[roomID].settings})
    
                } else {
                    const currentRoom = clients[id].currentRoom
                    
                    delete rooms[currentRoom].clients[id]
                    client.to(currentRoom).emit('move', rooms[currentRoom].clients)

                    client.leave(currentRoom)
                    const voice = rooms[currentRoom].activeVoice.indexOf(id);
                    if(voice !== -1) {
                        rooms[currentRoom].activeVoice.splice(voice, 1);
                    }

                    client.join(roomID)
                    clients[id].currentRoom = roomID

                    client.emit('move', rooms[roomID].clients)
                    client.emit('currentRoom', {settings: rooms[roomID].settings, atPos: atPos})
                }
            }
        } catch(error) {
            
            console.error(error);
            console.log(`error from user ${client.id}`)
        }
        
    })

    client.on('getEmail', ({ email }) => {
        if(email) {

            if (!activeEmail.includes(email) ) {

                activeEmail.push(email)

                if (!database.data.hasOwnProperty(email)) { 
                    database.set(`${email}`, {
                        avatarUrl: defaultAvatar
                    });
                } else {
                    const userConfig = database.get(`${email}`)
                    
                    client.emit('configSetting', userConfig.avatarUrl)
                }

                clients[client.id] = {
                    currentRoom: '',
                    email: email,
                }

                client.emit('alreadyLogin', false);
                
            } else { 
                client.emit('alreadyLogin', true);
                client.disconnect()
            }
        } else {

            client.emit('configSetting', defaultAvatar)
        
            clients[client.id] = {
                currentRoom: '',
                email: '',
            }

            client.emit('alreadyLogin', false);
        }
    
    })
    
    client.on('move', ({ id, rotation, position, action }) => {
        try {
            
            if(clients[id]) {
                const currentRoom = clients[id].currentRoom

                rooms[currentRoom].clients[id].position = position
                rooms[currentRoom].clients[id].rotation = rotation
                rooms[currentRoom].clients[id].action = action

                client.to(currentRoom).emit('move', rooms[currentRoom].clients)
            } else {
                client.emit("failed move")
            }

        } catch (error) {

            console.error(error);
            console.log(`error from user ${client.id}`)
        }
    })

    client.on('config', ({ id, avatarUrl}) => {
        rooms[clients[id].currentRoom].clients[id].avatarUrl = avatarUrl
    })

    client.emit('message', messages)
    client.on('message', (msg) => {
        if(clients[msg.id]) {
            messages.push(msg)
                
            if(clients[msg.id]) {
                const currentRoom = clients[msg.id].currentRoom

                rooms[currentRoom].clients[msg.id].chathead = msg.message;

                if(chatheadTimeout) {
                    clearTimeout(chatheadTimeout);
                }

                chatheadTimeout = setTimeout(() => {
                    rooms[currentRoom].clients[msg.id].chathead = "";
                }, 5000);
            }
            
            ioServer.sockets.emit('message', messages);
        }
    });

    client.on('join voice', ({id}) => {
        if(clients[id]) {
            const currentRoom = clients[id].currentRoom
            const found = rooms[currentRoom].activeVoice.find((ID) => ID !== id);
            if(found) {
                rooms[currentRoom].activeVoice.push(id)
            }

            client.emit('enabled Join Voice', {enabled: true})
        }
    })

    client.on('exit voice', ({id}) => {
        if(clients[id]) {
            const currentRoom = clients[id].currentRoom
            const found = rooms[currentRoom].activeVoice.find((ID) => ID === id);
            if(found) {
                const voice = rooms[currentRoom].activeVoice.indexOf(id);
                if(voice !== -1) {
                    rooms[currentRoom].activeVoice.splice(voice, 1);
                }
            }
        }
    })

    // client.emit("selectedQuestions", randomQuestions());

    // client.on("getRandomQuestions", () => {
    //     const selectedQuestions = randomQuestions();
    //     client.emit("selectedQuestions", selectedQuestions);
    // });

    client.on("Admin_check", ({ id, password}) => {
        const admin = adminData.get('account');
        
        let check;

        Object.keys(admin).forEach((adminID, index, arr) => {
            if(id === adminID) {
                const adminPassword = adminData.get(`account.${adminID}.password`);
                if(password === adminPassword) {
                    check = true;
                    adminData.append("log", {id: id, action: "เข้าสู่ระบบ", time: Date.now()});
                    // const date = new Date(Date.now());
                    // console.log(date.toLocaleString());
                    arr.length = index + 1
                    
                } else {
                    check = false;
                }
            } else {
                
                check = false;
            }
        })

        client.emit("Admin_check" , {check: check, id: id})
    })

    client.on('get stats', () => {
        const stats = {
            clients: Object.keys(clients).length,
            registedEmail: Object.keys(database.get()).length,
            activeEmail: activeEmail.length
        }

        client.emit("get stats", stats)
    })

    client.on('get admin', () => {
        const admin = adminData.get()

        client.emit("get admin", admin)
    })

    client.on("add admin", ({id, password}) => {
        adminData.set(`account.${id}`, {password: password})

        const admin = adminData.get()
        client.emit("get admin", admin)
    })

    client.on("clear log", () => {
        adminData.set('log', [])

        const admin = adminData.get()
        client.emit("get admin", admin)
    })

    client.on("remove admin", (id) => {
        if(Object.keys(adminData.get("account")).length > 1) {
            adminData.unset(`account.${id}`)
        }

        const admin = adminData.get()
        client.emit("get admin", admin)
    })

    client.on("get user", () => {
        const user = database.get()
        client.emit("get user", user)
    })

    client.on("get scene", () => {
        const scene = roomData.get()
        client.emit("get scene", scene)
    })

    client.on('disconnect', () => {
        console.log(
            `User ${client.id} disconnected, there are currently ${ioServer.engine.clientsCount} users connected`
        )

        if(clients[client.id]){
            const currentRoom = clients[client.id].currentRoom
            
            const email = clients[client.id].email

            if(email !== ''){

                const index = activeEmail.indexOf(email);

                    activeEmail.splice(index, 1);

                if(currentRoom !== '') {
                    database.set(`${email}.avatarUrl`, rooms[currentRoom].clients[client.id].avatarUrl);
                    client.leave(currentRoom)

                    delete rooms[currentRoom].clients[client.id]
                    
                    const voice = rooms[currentRoom].activeVoice.indexOf(client.id);
                    if(voice !== -1) {
                        rooms[currentRoom].activeVoice.splice(voice, 1);
                    }
                }
            } else {
                
                if(currentRoom !== '') {
                    
                    client.leave(currentRoom)

                    delete rooms[currentRoom].clients[client.id]
                    
                    const voice = rooms[currentRoom].activeVoice.indexOf(client.id);
                    if(voice !== -1) {
                        rooms[currentRoom].activeVoice.splice(voice, 1);
                    }

                }

            }

            delete clients[client.id]
        }
    })

})

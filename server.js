import { Server } from 'socket.io';
import editJsonFile from 'edit-json-file'
 
const database = editJsonFile('./database.json', {
    autosave: true
});

const questionsData = editJsonFile('./questions.json', {
    autosave: true
});

const adminData = editJsonFile('./admin_log.json', {
    autosave: true
});

const roomData = editJsonFile('./rooms.json', {
    autosave: true
});

const origin = process.env.CLIENT_URL || "http://localhost:5173";

const ioServer = new Server({
    cors: {
      origin,
    },
})

ioServer.listen(3000)

console.log("Server started on port 3000, allowed cors origin: " + origin);

let clients = {}
const messages = [];
let chatheadTimeout;

// const randomQuestions = () => {
    
//     const questions = questionsData.get("questions")
//     const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
//     const selectedQuestions = shuffledQuestions.slice(0, 3);
//     return selectedQuestions;
// };  

const rooms = [];

const loadRooms = async () => {
    let data;
    data = roomData.data

    data.forEach((roomItem) => {
        const room = {
        ...roomItem,
        clients: {},
        activeVoice: []
        };

        rooms.push(room);
    });
};

loadRooms();

let activeEmail = []
const defaultAvatar = 'https://models.readyplayer.me/655a5d4e9b792809cdac419d.glb'

ioServer.on('connection', (client) => {

    console.log(
        `User ${client.id} connected, there are currently ${ioServer.engine.clientsCount} users connected`
    )

    client.on('joinroom', ({id, name, avatarUrl, roomID}) => {

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
    
                if(clients[id].currentRoom === ''){
    
                    clients[id].currentRoom = roomID
    
                } else {
                    
                    delete rooms[clients[id].currentRoom].clients[id]
                    clients[id].currentRoom = roomID

                    if(rooms[roomID].activeVoice.includes(id)) {

                        const activeVoiceIindex = rooms[roomID].activeVoice.indexOf(id);
                        
                            rooms[roomID].activeVoice.splice(activeVoiceIindex, 1);
                    }
                }
    
                client.emit('respawn', [3, 5, 2])
                client.emit('move', rooms[roomID].clients)
                client.emit('currentRoom', roomID)
            }
        } catch(error) {
            
            client.disconnect(); 
            console.error(error);
            console.log(`user ${client.id} disconnected`)
        }
        
    })

    client.on('getEmail', ({ email }) => {
        if (email) {

            if (!activeEmail.includes(email) ) {
                
                activeEmail.push(email)

                if (!database.data.hasOwnProperty(email)) { 
                    database.set(`${email}`, {
                        avatarUrl: defaultAvatar
                    });
                } else {
                    const userConfig = database.get(`${email}`)
                    
                    // client.emit('inventory', clients[client.id].inventory)
                    client.emit('configSetting', userConfig.avatarUrl)
                }
            } else { 
                client.emit('alreadyLogin', true);
                client.disconnect()
            }
        } else {

            client.emit('configSetting', defaultAvatar)
        }

        
        clients[client.id] = {
            currentRoom: '',
            email: email,
        }
    
    })
    
    client.on('move', ({ id, rotation, position, action }) => {
        try {
            
            rooms[clients[id].currentRoom].clients[id].position = position
            rooms[clients[id].currentRoom].clients[id].rotation = rotation
            rooms[clients[id].currentRoom].clients[id].action = action

            client.emit('move', rooms[clients[id].currentRoom].clients)

        } catch (error) {

            client.disconnect(); 
            console.error(error);
            console.log(`user ${client.id} disconnected`)
        }
    })

    client.on('config', ({ id, avatarUrl}) => {
        rooms[clients[id].currentRoom].clients[id].avatarUrl = avatarUrl
    })

    client.emit('message', messages)
    client.on('message', (msg) => {
        messages.push(msg)
            
        rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = msg.message;

        if(chatheadTimeout) {
            clearTimeout(chatheadTimeout);
        }

        chatheadTimeout = setTimeout(() => {
            rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = "";
        }, 5000);
        
        ioServer.sockets.emit('message', messages);
    });

    client.on('join voice', () => {

        try {

            if(!rooms[clients[client.id].currentRoom].activeVoice.includes(client.id)) {

                const usersInThisRoom = rooms[clients[client.id].currentRoom].activeVoice.filter(id => id !== client.id);
                
                rooms[clients[client.id].currentRoom].activeVoice.push(client.id)

                client.emit("all users", usersInThisRoom);
            }

        } catch (error) {
            
            client.disconnect(); 
            console.error(error);
            console.log(`user ${client.id} disconnected`)
        }
    })

    client.on('sending signal', ({ userToSignal, callerID, signal }) => {
        ioServer.to(userToSignal).emit('user joined', { signal: signal, callerID: callerID });
    })

    client.on('returning signal', ({ signal, callerID }) => {
        ioServer.to(callerID).emit('receiving returned signal', { signal: signal, id: client.id });
    })

    client.on('exit voice', (id) => {
        const activeVoiceIindex = rooms[clients[id].currentRoom].activeVoice.indexOf(id);
    
            if(activeVoiceIindex !== -1) {
                rooms[clients[id].currentRoom].activeVoice.splice(activeVoiceIindex, 1);
            }
    })

    // client.emit("selectedQuestions", randomQuestions());

    // client.on("getRandomQuestions", () => {
    //     const selectedQuestions = randomQuestions();
    //     client.emit("selectedQuestions", selectedQuestions);
    // });

    // client.on("Admin_check", ({ id, password}) => {
    //     const admin = adminData.get('account');
        
    //     let check = false;

    //     Object.keys(admin).forEach((adminID) => {
            

    //         if  (adminID == id) {
    //             const adminPassword = adminData.get(`account.${adminID}.password`);
                
    //             console.log(adminID, id)
    //             if (adminPassword == password) {
    //                 check = true;
                    
    //             } else {
    //                 check = false;
    //             }
    //         } else {
                
    //             check = false;
    //         }
    //     })

        
    //     client.emit("Admin_check" , check)
    // })

    client.on('disconnect', () => {
        console.log(
            `User ${client.id} disconnected, there are currently ${ioServer.engine.clientsCount} users connected`
        )

        if(clients[client.id]){
            
            const email = clients[client.id].email
            if(email !== ''){

                const index = activeEmail.indexOf(email);

                    activeEmail.splice(index, 1);
            }

            if(clients[client.id].currentRoom !== ''){
                
                database.set(`${email}.avatarUrl`, rooms[clients[client.id].currentRoom].clients[client.id].avatarUrl);

                delete rooms[clients[client.id].currentRoom].clients[client.id]

                if(rooms[clients[client.id].currentRoom].activeVoice.includes(client.id)) {
                        
                    const activeVoiceIindex = rooms[clients[client.id].currentRoom].activeVoice.indexOf(client.id);
                    
                        rooms[clients[client.id].currentRoom].activeVoice.splice(activeVoiceIindex, 1);
                }

            }

        }

        delete clients[client.id]
    })

})

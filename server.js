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

const rooms = {};

const loadRooms = async () => {
    let data;
    data = roomData.data

    data.forEach((roomItem) => {
        const room = {
            clients: {},
            activeVoice: {}
        };

        rooms[roomItem.id] = room
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

                    if(rooms[clients[id].currentRoom].activeVoice.hasOwnProperty(id)) {
                        client.leave(clients[id].currentRoom)
                        delete rooms[clients[id].currentRoom].activeVoice[id]
                    }

                    clients[id].currentRoom = roomID
                }
    
                client.emit('respawn', [3, 5, 2])
                client.emit('move', rooms[roomID].clients)
                client.emit('currentRoom', roomID)
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
                    
                    // client.emit('inventory', clients[client.id].inventory)
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
                email: email,
            }

            client.emit('alreadyLogin', false);
        }
    
    })
    
    client.on('move', ({ id, rotation, position, action }) => {
        try {
            
            if(clients[id]) {
                rooms[clients[id].currentRoom].clients[id].position = position
                rooms[clients[id].currentRoom].clients[id].rotation = rotation
                rooms[clients[id].currentRoom].clients[id].action = action

                client.emit('move', rooms[clients[id].currentRoom].clients)
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
                rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = msg.message;

                if(chatheadTimeout) {
                    clearTimeout(chatheadTimeout);
                }

                chatheadTimeout = setTimeout(() => {
                    rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = "";
                }, 5000);
            }
            
            ioServer.sockets.emit('message', messages);
        }
    });

    client.on('join voice', ({id}) => {
        let enabled
        if(clients[id]) {
            if(!rooms[clients[id].currentRoom].activeVoice.hasOwnProperty(id)) {
                
                client.join(clients[id].currentRoom)
                rooms[clients[id].currentRoom].activeVoice[id] = {
                    mute: false
                }

                enabled = true
                const mutedUser = Object.keys(rooms[clients[id].currentRoom].activeVoice).filter((ID) => rooms[clients[id].currentRoom].activeVoice[ID].mute === true);

                client.emit('mutedUser', mutedUser)
            }

            client.emit('enabled Join Voice', {enabled: enabled})
        } else {
            client.emit('enabled Join Voice', {enabled: false})
        }
    })

    client.on('setMute', ({onMute, from}) => {
        
        if(clients[from]) {
            rooms[clients[from].currentRoom].activeVoice[from].mute = onMute
            const mutedUser = Object.keys(rooms[clients[from].currentRoom].activeVoice).filter((ID) => rooms[clients[from].currentRoom].activeVoice[ID].mute === true);

            client.to(clients[from].currentRoom).emit('mutedUser', mutedUser)
        }
    })

    client.on('exit voice', ({id}) => {
        if(clients[id]) {
            if(rooms[clients[id].currentRoom].activeVoice.hasOwnProperty(id)) {
                client.leave(clients[id].currentRoom)
                delete rooms[clients[id].currentRoom].activeVoice[id]
                const mutedUser = Object.keys(rooms[clients[id].currentRoom].activeVoice).filter((ID) => rooms[clients[id].currentRoom].activeVoice[ID].mute === true);
                    
                client.to(clients[id].currentRoom).emit('mutedUser', mutedUser)
            }
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
                
                client.leave(clients[client.id].currentRoom)
                delete rooms[clients[client.id].currentRoom].activeVoice[client.id]

            }

        }

        delete clients[client.id]
    })

})

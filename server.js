import { Server } from 'socket.io';
import editJsonFile from 'edit-json-file'
import { google } from 'googleapis';
import { Readable } from 'stream';

const characterData = editJsonFile('./character.json', {
    autosave: true
});

const questionsData = editJsonFile('./question.json', {
    autosave: true
});

const adminData = editJsonFile('./admin.json', {
    autosave: true
});

const roomData = editJsonFile('./rooms.json', {
    autosave: true
});

const defaultData = editJsonFile('./default.json', {
    autosave: true
});

const origin = process.env.CLIENT_URL || "http://127.0.0.1:5173";
const adminSite = process.env.ADMIN_URL || "http://127.0.0.1:5000";

const CLIENT_ID = '780876938602-9gv1bfpipggqst85hvsu5hv9u149c0at.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

const REFRESH_TOKEN = '1//04ekYp_4V-5mYCgYIARAAGAQSNwF-L9Ir2OapPc2wB_w6Vx5x6mCECsTdrbUgcZSgWs-9HiM9sxaCL6LNFot40WRBJraPMnDhzWI';

const DOWNLOAD_KEY = "AIzaSyD7xq_I3NdTPkBKZ4AKMuivcmcpQv5x0xg"

const ouath2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
)

ouath2Client.setCredentials({refresh_token: REFRESH_TOKEN})

const drive = google.drive({
    version: 'v3',
    auth: ouath2Client
})

const ioServer = new Server({
    cors: {
        origin: [origin, adminSite],
    },
    maxHttpBufferSize: 5e8
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

function bufferToStream(buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // Mark the end of the stream
    return stream;
}

async function generatePublicUrl(fileId) {
    try {
        await drive.permissions.create({
            fileId, fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        })
    } catch (error) {
        console.log("error generate Public Url: ", error)
    }
} 

const rooms = {};
const animations = []

const loadRooms = async () => {
    const data = roomData.get()
    const animationData = defaultData.get('animations') 

    data.forEach((roomItem) => {
        const room = {
            settings: {...roomItem},
            clients: {},
            activeVoice: []
        };

        rooms[roomItem.id] = room
    });

    animationData.forEach((animation) => {
        animations.push(`https://www.googleapis.com/drive/v3/files/${animation.url}?alt=media&key=${DOWNLOAD_KEY}`)
    })
};

loadRooms();

let activeEmail = []

ioServer.on('connection', (client) => {

    console.log(
        `User ${client.id} connected, there are currently ${ioServer.engine.clientsCount} users connected`
    )

    client.on('joinroom', ({id, name, avatarUrl, roomID, atPos}) => {

        try {

            if(rooms[roomID].settings) {
                if(!rooms[roomID].clients.hasOwnProperty(id)) {

                    rooms[roomID].clients[id] = {
                        name: name,
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                        action: "idle",
                        chathead: "" ,
                        avatarUrl: avatarUrl,
                    }

                    const setting = rooms[roomID].settings

                    const settings = {
                        id: setting.id,
                        name: setting.name,
                        url: `https://www.googleapis.com/drive/v3/files/${setting.url}?alt=media&key=${DOWNLOAD_KEY}`,
                        scale: setting.scale,
                        pos: setting.pos,
                        rot: setting.rot,
                        spawnPos: setting.spawnPos[atPos] !== undefined ? setting.spawnPos[atPos] : setting.spawnPos[0],
                        enterBT: setting.enterBT,
                        colliders: setting.colliders,
                        interactive: setting.interactive
                    }
        
                    if(clients[id]) {
                        if(clients[id].currentRoom === '') {                    
                        
                            // client.join(roomID)
                            clients[id].currentRoom = roomID
            
                        } else {
                            const currentRoom = clients[id].currentRoom

                            // client.leave(currentRoom)

                            const voice = rooms[currentRoom].activeVoice.indexOf(id);
                            if(voice !== -1) {
                                rooms[currentRoom].activeVoice.splice(voice, 1);
                            }
                            
                            delete rooms[currentRoom].clients[id]
                            // client.to(currentRoom).emit('move', rooms[currentRoom].clients)

                            // client.join(roomID)
                            clients[id].currentRoom = roomID   
                        }

                        client.emit('move', rooms[roomID].clients)
                        client.emit('currentRoom', settings)
                    }
                    
                }
            }
        } catch(error) {
            
            console.error(error);
            console.log(`error from user ${client.id}`)
        }
        
    })

    client.on('getEmail', ({ email }) => {
        if(email) {

            if(!activeEmail.includes(email)) {

                activeEmail.push(email)

                if(!characterData.data.hasOwnProperty(email)) { 
                    characterData.set(`${email}`, {
                        avatarUrl: characterData.get("default").avatarUrl
                    });
                } else {
                    const userConfig = characterData.get(`${email}`)
                    
                    client.emit('configSetting', {avatarUrl: userConfig.avatarUrl, animations: animations})
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

            client.emit('configSetting', {avatarUrl: characterData.get("default").avatarUrl, animations: animations})
        
            clients[client.id] = {
                currentRoom: '',
                email: '',
            }

            client.emit('alreadyLogin', false);
        }

        client.emit('starting point', defaultData.get('spawn'))
    })
    
    client.on('move', ({ id, rotation, position, action }) => {
        try {
            
            if(clients[id]) {
                const currentRoom = clients[id].currentRoom

                rooms[currentRoom].clients[id].position = position
                rooms[currentRoom].clients[id].rotation = rotation
                rooms[currentRoom].clients[id].action = action

                // client.to(currentRoom).emit('move', rooms[currentRoom].clients)
                client.emit('move', rooms[currentRoom].clients)
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
        console.log(msg)
        if(clients[msg.id]) {
            
            const currentRoom = clients[msg.id].currentRoom
            messages.push(msg)
                
            if(currentRoom){
                if(clients[msg.id]) {

                    rooms[currentRoom].clients[msg.id].chathead = msg.message;

                    if(chatheadTimeout) {
                        clearTimeout(chatheadTimeout);
                    }

                    chatheadTimeout = setTimeout(() => {
                        rooms[currentRoom].clients[msg.id].chathead = "";
                        // client.to(currentRoom).emit('move', rooms[currentRoom].clients)
                    }, 5000);
                }
                
                ioServer.sockets.emit('message', messages);
                // client.to(currentRoom).emit('move', rooms[currentRoom].clients)
            }
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

    client.on("Admin_check", ({ id, password }) => {
        const admin = adminData.get('account');
        
        let check;

        Object.keys(admin).forEach((adminID, index, arr) => {
            if(id === adminID) {
                const adminPassword = adminData.get(`account.${adminID}.password`);
                if(password === adminPassword) {
                    check = true;
                    adminData.append("log", {id: id, action: "เข้าสู่ระบบ", time: Date.now()});
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
            registedEmail: Object.keys(characterData.get()).slice(1).length,
            activeEmail: activeEmail.length
        }

        client.emit("get stats", {stats: stats, startPoint: defaultData.get("spawn"), downloadKey: DOWNLOAD_KEY, animations: defaultData.get('animations')})
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
        const user = characterData.get()
        client.emit("get user", user)
    })

    client.on("save character", ({Email, avatarUrl}) => {
        characterData.set(`${Email}.avatarUrl`, avatarUrl)

        const user = characterData.get()
        client.emit("get user", user)
    })

    client.on("get scene", () => {
        const Scenes = roomData.get()
        client.emit("get scene", Scenes)
    })

    client.on("save scene", ({scene, sceneIndex}) => {
        if(roomData.get(`${sceneIndex}`)) {
            roomData.set(`${sceneIndex}`, scene)

            rooms[roomData.get(`${sceneIndex}`).id].settings = scene
        }
    })

    client.on("save all scene", ({scene}) => {
        const jsonString = JSON.stringify(scene, null, 2);
        roomData.write(jsonString)
        roomData.data = scene
    })
    

    client.on("get start point", () => {
        const rooms = roomData.get()
        const roomtoselect = {}

        rooms.forEach((room) => {
            roomtoselect[room.id] = {
                name: room.name,
                spawnPos: [...room.spawnPos]
            }
        })

        client.emit("get start point", roomtoselect)
    })

    client.on("edit start point", (edit) => {
        defaultData.set("spawn", edit)
    })

    client.on("delete scene", async ({sceneID, sceneURL}) => {
       try{
            if(rooms[sceneID]) {
                delete rooms[sceneID].settings

                if(Object.keys(rooms[sceneID].clients).length === 0) {
                    delete rooms[sceneID]
                }
            }
            const response = await drive.files.delete({
                fileId: sceneURL,
            })
            console.log('delete file:', sceneID, response.status)
            client.emit('delete scene complete', true)
            

        } catch (error) {
            console.log('Error delete file:', error.message);
            client.emit('delete scene complete', false)
        }
    })

    client.on("update scene", async ({file, filename, sceneURL}) => {
        try {
            let mimeType
            
            if(filename.endsWith('.glb')) {
                mimeType = "model/gltf-binary"
            } else if (filename.endsWith('.gltf')) {
                mimeType = "model/gltf+json"
            }

            const response = await drive.files.update({
                fileId: sceneURL,
                requestBody: {
                    name: filename,
                    mimeType: mimeType,
                },
                media: {
                    mimeType: mimeType,
                    body: bufferToStream(file)
                }
                
            })
            console.log('Update File,', response.data.id);
        } catch (error) {
            console.log('Error delete file:', error.message);
        }
        client.emit('upload scene complete')
    })

    client.on("upload scene", async ({file, filename, sceneName}) => {

        try {
            let mimeType
            
            if(filename.endsWith('.glb')) {
                mimeType = "model/gltf-binary"
            } else if (filename.endsWith('.gltf')) {
                mimeType = "model/gltf+json"
            }

            const response = await drive.files.create({
              requestBody: {
                name: filename,
                mimeType: mimeType,
              },
              media: {
                mimeType: mimeType,
                body: bufferToStream(file)
              }
            });
        
            console.log('File uploaded,', response.data.id);
            generatePublicUrl(response.data.id)
            
            const lastRoom = roomData.get(`${roomData.data.length - 1}.id`)

            const newRoom = {
                id: String(Number(lastRoom) + 1),
                name: sceneName,
                url: `${response.data.id}`,
                scale: [1, 1, 1],
                pos: [0, 0, 0],
                rot: [0, 0, 0],
                spawnPos: [
                    [
                      0,
                      0,
                      0
                    ]
                ],
                enterBT: [],
                colliders: {},
                interactive: []
            }

            roomData.append('', newRoom)

            const room = {
                settings: {newRoom},
                clients: {},
                activeVoice: []
            };
    
            rooms[newRoom.id] = room

        } catch (error) {
            console.error('Error uploading file:', error);
        }
        client.emit('upload scene complete')
    })

    client.on("upload animation", async ({file, filename, action}) => {

        try {

            let mimeType
            
            if(filename.endsWith('.glb')) {
                mimeType = "model/gltf-binary"
            } else if (filename.endsWith('.gltf')) {
                mimeType = "model/gltf+json"
            }

            const response = await drive.files.create({
              requestBody: {
                name: filename,
                mimeType: mimeType,
              },
              media: {
                mimeType: mimeType,
                body: bufferToStream(file)
              }
            });
        
            console.log('File uploaded,', response.data.id);
            generatePublicUrl(response.data.id)

            const newAnimation = {
                action: action,
                url: response.data.id
            }

            defaultData.append('animations', newAnimation)
            animations.push(`https://www.googleapis.com/drive/v3/files/${response.data.id}?alt=media&key=${DOWNLOAD_KEY}`)
        } catch (error) {
            console.error('Error uploading file:', error);
        }
        client.emit('upload animation complete')
    })

    client.on('disconnect', () => {
        console.log(
            `User ${client.id} disconnected, there are currently ${ioServer.engine.clientsCount} users connected`
        )

        if(clients[client.id]){
            const currentRoom = clients[client.id].currentRoom
            
            const email = clients[client.id].email
            if(currentRoom !== '') {
                
                // client.leave(currentRoom)

                if(email !== '') {

                    const index = activeEmail.indexOf(email);

                        activeEmail.splice(index, 1);

                    characterData.set(`${email}.avatarUrl`, rooms[currentRoom].clients[client.id].avatarUrl);
                }

                const voice = rooms[currentRoom].activeVoice.indexOf(client.id);
                if(voice !== -1) {
                    rooms[currentRoom].activeVoice.splice(voice, 1);
                }

                delete rooms[currentRoom].clients[client.id]
                // client.to(currentRoom).emit('move', rooms[currentRoom].clients)
                
            } else {
                if(email !== '') {

                    const index = activeEmail.indexOf(email);

                    activeEmail.splice(index, 1);
                }
            }
            delete clients[client.id]
        }
    })

})

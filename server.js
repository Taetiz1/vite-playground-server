// import fs from 'fs'
// import express from 'express'
// import Router from 'express-promise-router'
// import { createServer } from 'vite'
// import viteConfig from '../vite.config.js'
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

// // Create router
// const router = Router()

// // Create vite front end dev server
// const vite = await createServer({
//     configFile: false,
//     server: {
//         middlewareMode: 'html',
//     },
//     ...viteConfig,
// })

// // Main route serves the index HTML
// router.get('/', async (req, res, next) => {
//     let html = fs.readFileSync('./index.html', 'utf-8')
//     html = await vite.transformIndexHtml(req.url, html)
//     res.send(html)
// })

// // Use vite middleware so it rebuilds frontend
// router.use(vite.middlewares)

// // Everything else that's not index 404s
// router.use('*', (req, res) => {
//     res.status(404).send({ message: 'Not Found' })
// })

// // Create express app and listen on port 
// const app = express()
// app.use(router)

// const port = process.env.PORT || 3000;

// const server = app.listen(port, () => {
//     console.log(`Listening on port http://localhost:${port}`)
// })

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
        };

        rooms.push(room);
    });
};

loadRooms();

let activeEmail = []
const defaultAvatar = 'https://models.readyplayer.me/655a5d4e9b792809cdac419d.glb'
// let activeVoice = []

ioServer.on('connection', (client) => {

    console.log(
        `User ${client.id} connected, there are currently ${ioServer.engine.clientsCount} users connected`
    )

    client.on('joinroom', ({id, name, avatarUrl, email, roomID}) => {

        if(!rooms[roomID].clients.hasOwnProperty(id)) {
            rooms[roomID].clients[id] = {
                name: name,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                action: "idle",
                chathead: "" ,
                avatarUrl: avatarUrl,
                // equipment: [],
                // config: {
                //     Skin: "#E7C495",
                //     Pupil: "#000000",
                //     Iris: "#798ABC",
                //     Sclera: "#FFFFFF",
                //     Hair: "hair_01",
                //     HairColor: "#25262b",
                // },
                // inventory: {},
                // email: email,
            }

            if (clients[id].currentRoom === ''){
                clients[id].currentRoom = roomID
                // clients[id] = {
                //     currentRoom: roomID,
                //     email: email,
                // }

            } else {
                
                delete rooms[clients[id].currentRoom].clients[id]
                clients[id].currentRoom = roomID
            }

            client.emit('respawn', [0, 5, 0])
            client.emit('move', rooms[roomID].clients)
            client.emit('currentRoom', roomID)
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

    // client.emit('inventory', clients[client.id].inventory)

    // client.on('equipItem', ({id, item}) => {
    //     clients[id].inventory[item].equipped = !clients[id].inventory[item].equipped
    //     if(clients[id].inventory[item].equipped){
    //         if (!clients[id].equipment.includes(item)) {
    //             clients[id].equipment.push(item)
    //         }
    //     } else {
    //         clients[id].equipment = clients[id].equipment.filter((member) => member !== item);
    //     }

        
    //     client.emit('inventory', clients[id].inventory)
    // })

    // client.on('checkItem', ({item}) => {
    //     clients[client.id].inventory[item].isNew = false

    //     client.emit('inventory', clients[client.id].inventory)
    // })

    // client.on('collectItem', ({item}) => {
    //     let type, header, text;
    //     if(!clients[client.id].inventory.hasOwnProperty(item.id)){
    //         const setItem = {
    //             [item.id] : {
    //                 name: item.name,
    //                 image: item.image, 
    //                 equipped: item.equipped, 
    //                 isNew: item.isNew
    //             }
    //         }

    //         clients[client.id].inventory = { ...clients[client.id].inventory, ...setItem }
    //         client.emit('inventory', clients[client.id].inventory)
    //         type = "normal"
    //         header = "ยินดีด้วย"
    //         text = `คุณได้รับเครื่องประดับชิ้นใหม่! ${item.name} ลองตรวจสอบใน inventory สิ`
            
    //         client.emit('isPicked', {type, header, text})

    //     } else {
            
    //         const type = "error"
    //         const header = "ล้มเหลม"
    //         const text = "ว่างเปล่า! คุณเคยเก็บไอเท็มนี้ไปแล้ว"

    //         client.emit('isPicked', {type, header, text})
    //     }

        
    // })
    
    client.on('move', ({ id, rotation, position, action }) => {
        rooms[clients[id].currentRoom].clients[id].position = position
        rooms[clients[id].currentRoom].clients[id].rotation = rotation
        rooms[clients[id].currentRoom].clients[id].action = action

        client.emit('move', rooms[clients[id].currentRoom].clients)
    })

    // client.on('config', ({ id, Skin, Pupil, Iris, Sclera, Hair, HairColor }) => {
    //     clients[id].config.Skin = Skin
    //     clients[id].config.Pupil = Pupil
    //     clients[id].config.Iris = Iris
    //     clients[id].config.Sclera = Sclera
    //     clients[id].config.Hair = Hair
    //     clients[id].config.HairColor = HairColor
    // })

    client.on('config', ({ id, avatarUrl}) => {
        rooms[clients[id].currentRoom].clients[id].avatarUrl = avatarUrl
    })

    client.emit('message', messages)
    client.on('message', (msg) => {
        messages.push(msg)
            
        rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = msg.message;

        if (chatheadTimeout) {
            clearTimeout(chatheadTimeout);
        }

        chatheadTimeout = setTimeout(() => {
            rooms[clients[msg.id].currentRoom].clients[msg.id].chathead = "";
        }, 5000);
        
        ioServer.sockets.emit('message', messages);
    });

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

    // client.on("join room", ({id}) => {
        
    //     if(!activeVoice.includes(id)){
    //         activeVoice.push(id)
    //     }
    //     client.join("voice room");

    //     const usersInThisRoom = activeVoice.filter((usersid) => usersid !== id);

    //     client.emit("all users", usersInThisRoom);
    //     // client.broadcast.to("voice room").emit("new user",  id)
    // })

    // client.on("sending signal", ({userToSignal, signal, callerID}) => {
    //     ioServer.to(userToSignal).emit('user joined', { signal: signal, callerID: callerID });
    // });

    // client.on("returning signal", ({signal, callerID}) => {
    //     ioServer.to(callerID).emit('receiving returned signal', { signal: signal, id: client.id });
    // });

    client.on('disconnect', () => {
        console.log(
            `User ${client.id} disconnected, there are currently ${ioServer.engine.clientsCount} users connected`
        )

        if(clients[client.id]){
            
            const email = clients[client.id].email
            if  (email != ''){
                const index = activeEmail.indexOf(email);

                if (index !== -1) {
                    activeEmail.splice(index, 1);
                }

                // database.pop(`${email}.inventory`)
                // database.append(`${email}.inventory`, clients[client.id].inventory);
            }
            

            if(clients[client.id].currentRoom !== ''){
                
                database.set(`${email}.avatarUrl`, rooms[clients[client.id].currentRoom].clients[client.id].avatarUrl);

                delete rooms[clients[client.id].currentRoom].clients[client.id]
            }

        }

        
        delete clients[client.id]
    })

})

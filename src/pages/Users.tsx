import { useState } from "react";

export default function Users() {

  const [users] = useState([
    {
      name: "Administrador",
      email: "admin@move360.com",
      role: "Administrador",
      status: "Ativo"
    }
  ]);

  return (
    <div className="page">

      <div className="panel-head">
        <h1>Usuários</h1>
        <p>Gerencie usuários, permissões e acessos ao sistema.</p>
      </div>

      <div className="panel">

        <button className="btn">
          Novo usuário
        </button>

        <table style={{width:"100%", marginTop:20}}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Perfil</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>

          {users.map((user,index)=>(

            <tr key={index}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>{user.status}</td>
            </tr>

          ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

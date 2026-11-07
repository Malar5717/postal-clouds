import { Link } from 'react-router-dom';

function Post() {
  return (
    <>
      <h1>Address, stamp and delivery options</h1>
      <Link to="/post-office">Back</Link>
      <Link to="/home">Post</Link>
    </>
  );
}

export default Post;

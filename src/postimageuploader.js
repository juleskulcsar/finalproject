import React from "react";
import axios from "./axios";

export default class PostImageUploader extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }
    handleClick() {
        this.props.handleClick();
    }

    upload(e) {
        e.preventDefault();
        this.file = e.target.files[0];
        let formData = new FormData();
        formData.append("file", this.file);
        axios
            .post("/postimageupload", formData)
            .then(({ data }) => {
                this.props.done(data);
            })
            .catch(err => {
                console.log("error in axios.post /postimageupload: ", err);
            });
    }

    render() {
        return (
            <div className="uploader">
                <div className="changePic">
                    <h3>upload project image</h3>
                    <input
                        id="uploadPhoto"
                        type="file"
                        className="file"
                        name="file"
                        accept="image/*"
                        // encType="multipart/form-data"
                        onChange={e => this.upload(e)}
                    />
                    <label id="label" htmlFor="file" />
                    <button onClick={e => this.handleClick(e)}>Cancel</button>
                </div>
            </div>
        );
    }
}
